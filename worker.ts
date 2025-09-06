const ws = new WebSocket("/control");

async function onUpdate(currentTouch: boolean[]) {
  const dt = +new Date();

  const buf = new ArrayBuffer(16); // 4 byte (dt) + 1 byte * 12 keys
  const df = new DataView(buf);
  df.setUint32(0, dt, true);
  for (let i = 0; i < currentTouch.length; i++) {
    const v = currentTouch[i];
    df.setUint8(4 + i, v ? 1 : 0);
  }
  ws.send(df);
}

onmessage = (e) => {
  onUpdate(e.data);
};
