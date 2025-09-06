interface Config {
  width: number;
  height: number;
  widthPerKey: number;
}

let canvas: OffscreenCanvas;
onmessage = (evt) => {
  if (evt.data.cmd) {
    canvas = evt.data.canvas;
    return;
  }
  requestAnimationFrame(() => renderFrame(evt.data.touches, evt.data.config));
};

function get2dContext(canvas: OffscreenCanvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error();
  return ctx;
}

function renderBoxes(touches: boolean[], cfg: Config) {
  const ctx = get2dContext(canvas);

  ctx.fillStyle = "orange";
  for (let i = 0; i < touches.length; i++) {
    if (!touches[i]) continue;
    ctx.moveTo(i * cfg.widthPerKey, 0);
    ctx.fillRect(i * cfg.widthPerKey, 0, cfg.widthPerKey, cfg.height);
  }
}

function renderLines(cfg: Config) {
  const ctx = get2dContext(canvas);
  for (let x = 0; x < cfg.width; x += cfg.widthPerKey * 4) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cfg.height);
    ctx.stroke();
  }
}

async function renderFrame(touches: boolean[], cfg: Config) {
  const ctx = get2dContext(canvas);
  ctx.reset();
  renderBoxes(touches, cfg);
  renderLines(cfg);
}
