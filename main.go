package main

import (
	"context"
	"encoding/binary"
	"flag"
	"log"
	"net/http"

	"github.com/bnema/libwldevices-go/virtual_keyboard"
	"github.com/gorilla/websocket"
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
var upgrader = websocket.Upgrader{}
var latestDt = uint32(0)
var lastTouches [12]bool

func createControlEndpoint(keyboard *virtual_keyboard.VirtualKeyboard) CallbackFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Print("upgrade:", err)
			return
		}
		defer c.Close()
		for {
			_, data, err := c.ReadMessage()
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

	http.HandleFunc("/control", createControlEndpoint(keyboard))
	http.Handle("/", http.FileServer(http.Dir(".")))
	http.Handle("/dist/", http.StripPrefix("/dist/", http.FileServer(http.Dir("dist"))))
	log.Fatal(http.ListenAndServe(*addr, nil))
}
