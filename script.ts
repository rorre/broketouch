function get2dContext() {
  const canvas = document.querySelector("canvas");
  if (!canvas) throw Error();
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error();
  return ctx;
}

const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;
const TOTAL_KEYS = 12;
const WIDTH_PER_KEY = window.innerWidth / TOTAL_KEYS;
const worker = new Worker("/dist/worker.js");

let hasSetup = false;

function setup() {
  // in portrait
  if (window.innerHeight > window.innerWidth) return;
  if (hasSetup) return;

  const canvas = document.querySelector("canvas")!;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  canvas.onclick = () => canvas.requestFullscreen();

  canvas.addEventListener("touchstart", touchStartOrMove);

  canvas.addEventListener("touchmove", (e) => touchStartOrMove(e, true));
  canvas.addEventListener("touchend", touchEnd);
  canvas.addEventListener("touchcancel", touchEnd);

  // requestAnimationFrame(renderFrame);
  // renderFrame([]);
  renderLines();
  hasSetup = true;
}

// ============================ sync mechanism
class BinarySemaphore {
  private locked = false;
  private waiters: Array<() => void> = [];

  async acquire(): Promise<void> {
    // If lock is free, take it immediately
    if (!this.locked) {
      this.locked = true;
      return;
    }
    // Otherwise, return a promise that resolves when the lock is released
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    }).then(() => {
      this.locked = true;
    });
  }

  release(): void {
    // If there are waiting requests, resolve the first one
    if (this.waiters.length > 0) {
      const nextResolve = this.waiters.shift();
      // resolve function sitting at the front of the queue (FIFO) is called, and lock is acquired again
      if (nextResolve) nextResolve();
    } else {
      // No waiting promises, so mark the lock as free
      this.locked = false;
    }
  }
}

const semaphore = new BinarySemaphore();
// ============================ touch related

const ongoingTouches = new Map<number, number>();
async function touchStartOrMove(ev: TouchEvent, isMove: boolean = false) {
  await semaphore.acquire();
  const touches = ev.changedTouches;

  for (const touch of touches) {
    if (isMove && !ongoingTouches.has(touch.identifier)) continue;
    ongoingTouches.set(
      touch.identifier,
      Math.floor(touch.pageX / WIDTH_PER_KEY)
    );
  }

  void onUpdate();
}

async function touchEnd(ev: TouchEvent) {
  await semaphore.acquire();
  const touches = ev.changedTouches;
  for (const touch of touches) {
    ongoingTouches.delete(touch.identifier);
  }

  void onUpdate();
}

function getCurrentTouches() {
  const touches: boolean[] = new Array(TOTAL_KEYS).fill(false);
  for (const touch of ongoingTouches.values()) {
    const idx = Math.min(touch, 11);
    touches[idx] = true;
  }
  return touches;
}

// ============ render related

// function renderBoxes(touches: boolean[]) {
//   const ctx = get2dContext();

//   ctx.fillStyle = "orange";
//   for (const touch of touches) {
//     ctx.moveTo(touch * WIDTH_PER_KEY, 0);
//     ctx.fillRect(touch * WIDTH_PER_KEY, 0, WIDTH_PER_KEY, HEIGHT);
//   }
// }

function renderLines() {
  const ctx = get2dContext();
  for (let x = 0; x < WIDTH; x += WIDTH_PER_KEY * 4) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
}

// async function renderFrame() {
//   const ctx = get2dContext();
//   ctx.reset();
//   renderBoxes(touches);
//   renderLines();
//   requestAnimationFrame(renderFrame);
// }

setup();

window.addEventListener(
  "orientationchange",
  (e) => window.screen.orientation.type.startsWith("landscape") && setup()
);

function onUpdate() {
  worker.postMessage(getCurrentTouches());
  semaphore.release();
}
