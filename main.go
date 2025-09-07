package main

import (
	"context"
	"crypto/tls"
	"encoding/binary"
	"flag"
	"log"
	"net/http"

	"github.com/bnema/libwldevices-go/virtual_keyboard"
	"github.com/quic-go/quic-go"
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"
)

type CallbackFunc (func(w http.ResponseWriter, r *http.Request))

var keyMapRow = [12]uint32{
	virtual_keyboard.KEY_CAPSLOCK,
	virtual_keyboard.KEY_A,
	virtual_keyboard.KEY_S,
	virtual_keyboard.KEY_D,
	virtual_keyboard.KEY_F,
	virtual_keyboard.KEY_G,
	virtual_keyboard.KEY_H,
	virtual_keyboard.KEY_J,
	virtual_keyboard.KEY_K,
	virtual_keyboard.KEY_L,
	virtual_keyboard.KEY_SEMICOLON,
	virtual_keyboard.KEY_APOSTROPHE,
}

var addr = flag.String("addr", "0.0.0.0:8000", "http service address")
var latestDt = uint32(0)
var lastTouches [12]bool

func createControlEndpoint(s *webtransport.Server, keyboard *virtual_keyboard.VirtualKeyboard) CallbackFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := s.Upgrade(w, r)
		if err != nil {
			log.Printf("upgrading failed: %s", err)
			w.WriteHeader(500)
			return
		}

		ctx := context.TODO()

		for {
			data, err := c.ReceiveDatagram(ctx)
			if err != nil {
				log.Println("read:", err)
				break
			}
			if len(data) < 16 {
				log.Println("invalid data length")
				continue
			}

			timestamp := binary.LittleEndian.Uint32(data[:4])
			if timestamp < latestDt {
				continue
			}

			var touches [12]bool
			for i := range 12 {
				touches[i] = data[4+i] != 0

				if lastTouches[i] != touches[i] {
					if touches[i] {
						keyboard.PressKey(keyMapRow[i])
					} else {
						keyboard.ReleaseKey(keyMapRow[i])
					}
				}
			}

			lastTouches = touches
			latestDt = timestamp
			log.Printf("recv: %+v", touches)
		}
	}
}

func main() {
	flag.Parse()
	ctx := context.Background()
	manager, err := virtual_keyboard.NewVirtualKeyboardManager(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer manager.Close()

	keyboard, err := manager.CreateKeyboard()
	if err != nil {
		log.Fatal(err)
	}
	defer keyboard.Close()

	mux := http.NewServeMux()

	s := webtransport.Server{
		H3: http3.Server{
			Handler:   mux,
			Addr:      *addr,
			TLSConfig: &tls.Config{},
			QUICConfig: &quic.Config{
				EnableDatagrams: true,
			},
		},
	}

	mux.Handle("/", http.FileServer(http.Dir(".")))
	mux.Handle("/dist/", http.StripPrefix("/dist/", http.FileServer(http.Dir("dist"))))
	mux.HandleFunc("/control", createControlEndpoint(&s, keyboard))

	go func() {
		http.ListenAndServeTLS(*addr, "./cert/localhost.crt", "./cert/localhost.key", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			s.H3.SetQUICHeaders(w.Header())
			mux.ServeHTTP(w, r)
		}))
	}()
	log.Fatal(s.ListenAndServeTLS("./cert/localhost.crt", "./cert/localhost.key"))
	// log.Fatal(s.ListenAndServe())
	// log.Fatal(http.ListenAndServe(*addr, nil))
}
