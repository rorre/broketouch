const ws = new WebSocket("/control");

let prevTouch: boolean[] = [];
// async function onUpdate(currentTouch: boolean[]) {
//   if (prevTouch == currentTouch) {
//     return;
//   }

//   const dt = +new Date();

//   const buf = new ArrayBuffer(16); // 4 byte (dt) + 1 byte * 12 keys
//   const df = new DataView(buf);
//   df.setUint32(0, dt);
//   for (let i = 0; i < currentTouch.length; i++) {
//     const v = currentTouch[i];
//     df.setUint8(4 + i, v ? 1 : 0);
//   }
//   ws.send(df);
//   prevTouch = currentTouch;
// }

async function onUpdate(currentTouch: boolean[]) {
  if (prevTouch == currentTouch) {
    return;
  }

  const dt = +new Date();
  ws.send(JSON.stringify({ timestamp: dt, touches: currentTouch }));
  prevTouch = currentTouch;
}

onmessage = (e) => {
  onUpdate(e.data);
};
