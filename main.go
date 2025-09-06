package main

import (
	"context"
	"encoding/binary"
	"flag"
	"log"
	"net/http"
	"sync"

	"github.com/bnema/libwldevices-go/virtual_keyboard"
	"github.com/gorilla/websocket"
)

type CallbackFunc (func(w http.ResponseWriter, r *http.Request))
type KeyboardCommand struct {
	Touches   []bool `json:"touches"`
	Timestamp uint32 `json:"timestamp"`
}

var keyMap = map[rune]uint32{
	'a': virtual_keyboard.KEY_A, 'b': virtual_keyboard.KEY_B, 'c': virtual_keyboard.KEY_C, 'd': virtual_keyboard.KEY_D, 'e': virtual_keyboard.KEY_E,
	'f': virtual_keyboard.KEY_F, 'g': virtual_keyboard.KEY_G, 'h': virtual_keyboard.KEY_H, 'i': virtual_keyboard.KEY_I, 'j': virtual_keyboard.KEY_J,
	'k': virtual_keyboard.KEY_K, 'l': virtual_keyboard.KEY_L, 'm': virtual_keyboard.KEY_M, 'n': virtual_keyboard.KEY_N, 'o': virtual_keyboard.KEY_O,
	'p': virtual_keyboard.KEY_P, 'q': virtual_keyboard.KEY_Q, 'r': virtual_keyboard.KEY_R, 's': virtual_keyboard.KEY_S, 't': virtual_keyboard.KEY_T,
	'u': virtual_keyboard.KEY_U, 'v': virtual_keyboard.KEY_V, 'w': virtual_keyboard.KEY_W, 'x': virtual_keyboard.KEY_X, 'y': virtual_keyboard.KEY_Y,
	'z':  virtual_keyboard.KEY_Z,
	'\n': virtual_keyboard.KEY_ENTER, '\t': virtual_keyboard.KEY_TAB, '[': virtual_keyboard.KEY_LEFTBRACE, ']': virtual_keyboard.KEY_RIGHTBRACE,
	';': virtual_keyboard.KEY_SEMICOLON, '\'': virtual_keyboard.KEY_APOSTROPHE,
	'\\': virtual_keyboard.KEY_BACKSLASH, ',': virtual_keyboard.KEY_COMMA, '.': virtual_keyboard.KEY_DOT, '/': virtual_keyboard.KEY_SLASH,
	'1': virtual_keyboard.KEY_CAPSLOCK,
}

var keyMapRow = [12]uint32{
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
	virtual_keyboard.KEY_ENTER,
}

var addr = flag.String("addr", "0.0.0.0:8000", "http service address")
var upgrader = websocket.Upgrader{}
var mutex = sync.Mutex{}
var latestDt = uint32(0)

func doKeyboardWork(keyboard *virtual_keyboard.VirtualKeyboard, cmd KeyboardCommand) {
	if cmd.Timestamp < latestDt {
		return
	}
	for idx, t := range cmd.Touches {
		k := keyMapRow[idx]

		if t {
			keyboard.PressKey(k)
		} else {
			keyboard.ReleaseKey(k)
		}
	}
	latestDt = cmd.Timestamp

}

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
			var touches [12]bool
			for i := 0; i < 12; i++ {
				touches[i] = data[4+i] != 0
			}
			cmd := KeyboardCommand{
				Touches:   touches[:],
				Timestamp: timestamp,
			}
			log.Printf("recv: %+v", cmd)

			mutex.Lock()
			doKeyboardWork(keyboard, cmd)
			mutex.Unlock()
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
