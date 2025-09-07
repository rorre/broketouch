const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;
const TOTAL_KEYS = 12;
const WIDTH_PER_KEY = window.innerWidth / TOTAL_KEYS;
const canvas = document.querySelector("canvas")!;
const worker = new Worker("/dist/worker.js");
const renderer = new Worker("/dist/renderer.js");

let hasSetup = false;

function setup() {
  // in portrait
  if (window.innerHeight > window.innerWidth) return;
  if (hasSetup) return;

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  // canvas.onclick = () => canvas.requestFullscreen();
  canvas.addEventListener("touchstart", touchStartOrMove);
  canvas.addEventListener("touchmove", (e) => touchStartOrMove(e, true));
  canvas.addEventListener("touchend", touchEnd);
  canvas.addEventListener("touchcancel", touchEnd);

  const offscreen = canvas.transferControlToOffscreen();
  renderer.postMessage({ cmd: "init", canvas: offscreen }, [offscreen]);

  hasSetup = true;
}

function isEqual(self: any[], other: any[]) {
  // if the other array is a falsy value, return
  if (!other) return false;
  // if the argument is the same array, we can be sure the contents are same as well
  if (other === self) return true;
  // compare lengths - can save a lot of time
  if (self.length != other.length) return false;

  for (let i = 0, l = self.length; i < l; i++) {
    // Check if we have nested arrays
    if (self[i] instanceof Array && other[i] instanceof Array) {
      // recurse into the nested arrays
      if (!self[i].equals(other[i])) return false;
    } else if (self[i] != other[i]) {
      // Warning - two different object instances will never be equal: {x:20} != {x:20}
      return false;
    }
  }
  return true;
}
// Hide method from for-in loops
Object.defineProperty(Array.prototype, "equals", { enumerable: false });

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

  onUpdate();
}

async function touchEnd(ev: TouchEvent) {
  await semaphore.acquire();
  const touches = ev.changedTouches;
  for (const touch of touches) {
    ongoingTouches.delete(touch.identifier);
  }

  onUpdate();
}

function getCurrentTouches() {
  const touches: boolean[] = new Array(TOTAL_KEYS).fill(false);
  for (const touch of ongoingTouches.values()) {
    const idx = Math.min(touch, 11);
    touches[idx] = true;
  }
  return touches;
}

setup();

window.addEventListener(
  "orientationchange",
  (e) => window.screen.orientation.type.startsWith("landscape") && setup()
);

let prevTouch: boolean[] = [];
function onUpdate() {
  const currentTouch = getCurrentTouches();
  if (isEqual(prevTouch, currentTouch)) {
    semaphore.release();
    return;
  }

  worker.postMessage(currentTouch);
  renderer.postMessage({
    touches: currentTouch,
    config: {
      width: WIDTH,
      height: HEIGHT,
      widthPerKey: WIDTH_PER_KEY,
    },
  });
  prevTouch = currentTouch;
  semaphore.release();
}
