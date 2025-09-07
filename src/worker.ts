const fromHexString = (hexString: string) =>
  Uint8Array.from(
    hexString.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );

const ws = new WebTransport("https://localhost:8000/control", {
  serverCertificateHashes: [
    {
      algorithm: "sha-256",
      value: fromHexString(
        "29198a12b28f4ce44544ba119a4d3e0041835f1255e3392dd7a26499c3d621ba"
      ),
    },
  ],
});

let w: WritableStreamDefaultWriter;
async function onUpdate(currentTouch: boolean[]) {
  await ws.ready;
  const dt = +new Date();

  const buf = new ArrayBuffer(16); // 4 byte (dt) + 1 byte * 12 keys
  const df = new DataView(buf);
  df.setUint32(0, dt, true);
  for (let i = 0; i < currentTouch.length; i++) {
    const v = currentTouch[i];
    df.setUint8(4 + i, v ? 1 : 0);
  }

  if (!w) w = ws.datagrams.writable.getWriter();
  await w.write(df);
}

onmessage = (e) => {
  onUpdate(e.data);
};
