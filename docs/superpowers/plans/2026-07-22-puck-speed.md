# Puck Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-browser mobile PWA that measures ice-hockey puck speed from a shooting ramp, using the phone mic as a shot trigger and the camera + a hybrid vision estimator for the speed.

**Architecture:** Testable pure-logic core (ring buffer, onset detection, frame differencing, blob detection, trajectory fit, hybrid speed estimator, calibration, history) built and unit-tested against synthetic frames/audio with zero device dependency, then a thin browser layer (getUserMedia + `requestVideoFrameCallback` capture, WebAudio AudioWorklet trigger, UI, PWA shell) wired on top and validated on the target iPhone.

**Tech Stack:** Vanilla JS (ES modules), Vite (dev/build), Vitest + jsdom (tests), WebAudio AudioWorklet, `requestVideoFrameCallback`, Canvas/OffscreenCanvas, localStorage, service worker.

## Global Constraints

- **100% in-browser, no server.** All processing on-device; installable as a PWA.
- **Target: Chrome on iOS (= WebKit).** No Blink camera stack; design for 30–60 fps `getUserMedia`, adapt to the actually-granted rate. Never assume >60 fps.
- **Fail loud, never fabricate a speed.** No calibration → measurement blocked. Ambiguous/too-few frames → report "no valid shot", not a number.
- **SI internally; display km/h.** Speed math in m/s, one decimal km/h shown.
- **Units of time:** capture/trigger wall-clock in **milliseconds** (`performance.now()`); per-frame media timing in **seconds** (`VideoFrameCallbackMetadata.mediaTime`) used for velocity. Keep these two separate.
- **Coordinate space:** detection runs on a downscaled frame (~480 px wide). Calibration pixel measurements and detection MUST share that same detection-pixel space.
- **Standard puck diameter:** 76.2 mm (0.0762 m).
- **ES modules, `"type": "module"`.** No CommonJS.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `vitest.config.js`
- Create: `index.html`
- Create: `src/main.js`
- Test: `test/smoke.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` and `npm run dev`; module layout under `src/`.

- [ ] **Step 1: Write the failing test**

```js
// test/smoke.test.js
import { describe, it, expect } from 'vitest';
import { appName } from '../src/main.js';

describe('scaffold', () => {
  it('exposes the app name', () => {
    expect(appName()).toBe('puck-speed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm install && npm test`
Expected: FAIL — cannot resolve `../src/main.js` / `appName` not defined.

- [ ] **Step 3: Write minimal implementation + config**

```json
// package.json
{
  "name": "puck-speed",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0"
  }
}
```

```js
// vite.config.js
import { defineConfig } from 'vite';
export default defineConfig({ server: { host: true } });
```

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Puck Speed</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

```js
// src/main.js
export function appName() {
  return 'puck-speed';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.js vitest.config.js index.html src/main.js test/smoke.test.js package-lock.json
git commit -m "chore: scaffold vite + vitest project"
```

---

### Task 2: Unit conversions (`units.js`)

**Files:**
- Create: `src/math/units.js`
- Test: `test/units.test.js`

**Interfaces:**
- Produces: `mpsToKmh(mps: number): number`, `pxPerMeter(pixels: number, meters: number): number` (throws on `meters <= 0`).

- [ ] **Step 1: Write the failing test**

```js
// test/units.test.js
import { describe, it, expect } from 'vitest';
import { mpsToKmh, pxPerMeter } from '../src/math/units.js';

describe('units', () => {
  it('converts m/s to km/h', () => {
    expect(mpsToKmh(10)).toBeCloseTo(36, 6);
  });
  it('computes px per meter', () => {
    expect(pxPerMeter(200, 0.5)).toBeCloseTo(400, 6);
  });
  it('rejects non-positive meters', () => {
    expect(() => pxPerMeter(200, 0)).toThrow(/meters/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- units`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/math/units.js
export function mpsToKmh(mps) {
  return mps * 3.6;
}

export function pxPerMeter(pixels, meters) {
  if (meters <= 0) throw new Error('meters must be > 0');
  return pixels / meters;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- units`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/math/units.js test/units.test.js
git commit -m "feat: unit conversions (m/s->km/h, px/m)"
```

---

### Task 3: Trajectory line fit (`linefit.js`)

**Files:**
- Create: `src/math/linefit.js`
- Test: `test/linefit.test.js`

**Interfaces:**
- Produces:
  - `linearSlope(xs: number[], ys: number[]): number` — least-squares slope (0 if degenerate).
  - `fitTrajectory(points: {t:number,x:number,y:number}[]): {vx:number,vy:number,x0:number,y0:number}` — velocity components (px per unit t) and position intercept at t=0.
  - `predictAt(fit, t: number): [number, number]`.
- Consumed by: Task 8 (detect) and Task 9 (estimator).

- [ ] **Step 1: Write the failing test**

```js
// test/linefit.test.js
import { describe, it, expect } from 'vitest';
import { linearSlope, fitTrajectory, predictAt } from '../src/math/linefit.js';

describe('linefit', () => {
  it('finds the slope of a line', () => {
    expect(linearSlope([0, 1, 2, 3], [1, 3, 5, 7])).toBeCloseTo(2, 6);
  });
  it('returns 0 for a single point (degenerate)', () => {
    expect(linearSlope([5], [9])).toBe(0);
  });
  it('fits a constant-velocity trajectory', () => {
    const pts = [
      { t: 0, x: 0, y: 10 },
      { t: 1, x: 4, y: 10 },
      { t: 2, x: 8, y: 10 },
    ];
    const fit = fitTrajectory(pts);
    expect(fit.vx).toBeCloseTo(4, 6);
    expect(fit.vy).toBeCloseTo(0, 6);
    expect(predictAt(fit, 3)).toEqual([expect.closeTo(12, 6), expect.closeTo(10, 6)]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- linefit`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/math/linefit.js
export function linearSlope(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i];
    sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i];
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

export function fitTrajectory(points) {
  const ts = points.map((p) => p.t);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const vx = linearSlope(ts, xs);
  const vy = linearSlope(ts, ys);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mt = mean(ts);
  return { vx, vy, x0: mean(xs) - vx * mt, y0: mean(ys) - vy * mt };
}

export function predictAt(fit, t) {
  return [fit.x0 + fit.vx * t, fit.y0 + fit.vy * t];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- linefit`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/math/linefit.js test/linefit.test.js
git commit -m "feat: least-squares trajectory fit"
```

---

### Task 4: Frame ring buffer (`ringBuffer.js`)

**Files:**
- Create: `src/capture/ringBuffer.js`
- Test: `test/ringBuffer.test.js`

**Interfaces:**
- Produces: `class RingBuffer`
  - `constructor(windowMs: number)`
  - `push(frame: { t: number, ... })` — `t` is wall-clock ms; evicts frames older than `latest.t - windowMs`.
  - `snapshot(t0: number, t1: number): frame[]` — frames with `t0 <= t <= t1`, sorted ascending by `t`.
  - `get size(): number`, `clear(): void`.
- Consumed by: Task 11 (capture) stores `{ t, mediaTime, width, height, gray }`.

- [ ] **Step 1: Write the failing test**

```js
// test/ringBuffer.test.js
import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../src/capture/ringBuffer.js';

describe('RingBuffer', () => {
  it('evicts frames older than the window', () => {
    const rb = new RingBuffer(100); // 100 ms window
    rb.push({ t: 0 });
    rb.push({ t: 50 });
    rb.push({ t: 160 }); // cutoff = 60 -> drops t=0 and t=50
    expect(rb.size).toBe(1);
  });
  it('returns a time-bounded, sorted snapshot', () => {
    const rb = new RingBuffer(1000);
    rb.push({ t: 30 });
    rb.push({ t: 10 });
    rb.push({ t: 20 });
    expect(rb.snapshot(10, 20).map((f) => f.t)).toEqual([10, 20]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ringBuffer`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/capture/ringBuffer.js
export class RingBuffer {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.frames = [];
  }
  get size() {
    return this.frames.length;
  }
  push(frame) {
    this.frames.push(frame);
    const cutoff = frame.t - this.windowMs;
    while (this.frames.length && this.frames[0].t < cutoff) this.frames.shift();
  }
  snapshot(t0, t1) {
    return this.frames
      .filter((f) => f.t >= t0 && f.t <= t1)
      .sort((a, b) => a.t - b.t);
  }
  clear() {
    this.frames = [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ringBuffer`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/capture/ringBuffer.js test/ringBuffer.test.js
git commit -m "feat: timestamped frame ring buffer"
```

---

### Task 5: Audio onset detector (`onsetDetector.js`)

**Files:**
- Create: `src/audio/onsetDetector.js`
- Test: `test/onsetDetector.test.js`

**Interfaces:**
- Produces:
  - `rmsEnergy(samples: Float32Array | number[]): number`.
  - `class OnsetDetector`
    - `constructor({ refractoryMs?, riseFactor?, floor?, alpha? })` (defaults: 200, 3, 0.02, 0.05).
    - `process(energy: number, timeMs: number): boolean` — true exactly once per onset, respecting refractory.
- Consumed by: Task 12 (audio trigger).

- [ ] **Step 1: Write the failing test**

```js
// test/onsetDetector.test.js
import { describe, it, expect } from 'vitest';
import { rmsEnergy, OnsetDetector } from '../src/audio/onsetDetector.js';

describe('onset detection', () => {
  it('computes RMS energy', () => {
    expect(rmsEnergy([3, 4])).toBeCloseTo(Math.sqrt((9 + 16) / 2), 6);
  });

  it('fires once on a transient and respects the refractory window', () => {
    const d = new OnsetDetector({ refractoryMs: 200, riseFactor: 3, floor: 0.02, alpha: 0.05 });
    const fired = [];
    // quiet baseline
    for (let t = 0; t < 300; t += 20) fired.push(d.process(0.03, t));
    // loud crack at t=300
    fired.push(d.process(0.8, 300));
    // second crack inside refractory (t=350) -> ignored
    fired.push(d.process(0.8, 350));
    // crack after refractory (t=600) -> fires
    fired.push(d.process(0.8, 600));
    const triggerTimes = [];
    let t = 0;
    // re-run deterministically to collect indices
    expect(fired.filter(Boolean).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- onsetDetector`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/audio/onsetDetector.js
export function rmsEnergy(samples) {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / samples.length);
}

export class OnsetDetector {
  constructor({ refractoryMs = 200, riseFactor = 3, floor = 0.02, alpha = 0.05 } = {}) {
    this.refractoryMs = refractoryMs;
    this.riseFactor = riseFactor;
    this.floor = floor;
    this.alpha = alpha;
    this.baseline = 0;
    this.lastTrigger = -Infinity;
    this.primed = false;
  }
  process(energy, timeMs) {
    const isOnset =
      this.primed &&
      energy > this.floor &&
      energy > this.baseline * this.riseFactor &&
      timeMs - this.lastTrigger > this.refractoryMs;
    this.baseline = this.primed
      ? (1 - this.alpha) * this.baseline + this.alpha * energy
      : energy;
    this.primed = true;
    if (isOnset) {
      this.lastTrigger = timeMs;
      return true;
    }
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- onsetDetector`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/onsetDetector.js test/onsetDetector.test.js
git commit -m "feat: adaptive audio onset detector"
```

---

### Task 6: Frame differencing (`frameDiff.js`)

**Files:**
- Create: `src/detection/frameDiff.js`
- Test: `test/frameDiff.test.js`

**Interfaces:**
- Produces:
  - `absDiff(a: Uint8Array, b: Uint8Array): Uint8Array`.
  - `threshold(diff: Uint8Array, level: number): Uint8Array` — 0/1 mask.
- Consumed by: Task 8 (detect).

- [ ] **Step 1: Write the failing test**

```js
// test/frameDiff.test.js
import { describe, it, expect } from 'vitest';
import { absDiff, threshold } from '../src/detection/frameDiff.js';

describe('frameDiff', () => {
  it('computes absolute per-pixel difference', () => {
    const d = absDiff(Uint8Array.from([10, 200]), Uint8Array.from([12, 190]));
    expect(Array.from(d)).toEqual([2, 10]);
  });
  it('thresholds to a binary mask', () => {
    const m = threshold(Uint8Array.from([2, 10, 40]), 10);
    expect(Array.from(m)).toEqual([0, 1, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- frameDiff`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/detection/frameDiff.js
export function absDiff(a, b) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Math.abs(a[i] - b[i]);
  return out;
}

export function threshold(diff, level) {
  const out = new Uint8Array(diff.length);
  for (let i = 0; i < diff.length; i++) out[i] = diff[i] >= level ? 1 : 0;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- frameDiff`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/detection/frameDiff.js test/frameDiff.test.js
git commit -m "feat: frame differencing + thresholding"
```

---

### Task 7: Blob detection (`blobs.js`)

**Files:**
- Create: `src/detection/blobs.js`
- Test: `test/blobs.test.js`

**Interfaces:**
- Produces:
  - `principalAxis(sxx, syy, sxy): { majorLength: number, angle: number }`.
  - `connectedComponents(mask: Uint8Array, width, height, minPixels = 1): Blob[]` where
    `Blob = { count, cx, cy, minX, minY, maxX, maxY, majorLength, angle }` (4-connectivity).
- Consumed by: Task 8 (detect).

- [ ] **Step 1: Write the failing test**

```js
// test/blobs.test.js
import { describe, it, expect } from 'vitest';
import { connectedComponents } from '../src/detection/blobs.js';

function blank(w, h) {
  return { mask: new Uint8Array(w * h), w, h };
}
function fillRect(mask, w, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * w + x] = 1;
}

describe('connectedComponents', () => {
  it('finds one blob with correct centroid', () => {
    const { mask, w, h } = blank(10, 10);
    fillRect(mask, w, 2, 2, 4, 4); // 3x3 centred at (3,3)
    const blobs = connectedComponents(mask, w, h, 1);
    expect(blobs.length).toBe(1);
    expect(blobs[0].count).toBe(9);
    expect(blobs[0].cx).toBeCloseTo(3, 6);
    expect(blobs[0].cy).toBeCloseTo(3, 6);
  });
  it('separates two disjoint blobs and honours minPixels', () => {
    const { mask, w, h } = blank(12, 6);
    fillRect(mask, w, 0, 0, 2, 2); // 9 px
    fillRect(mask, w, 8, 4, 8, 4); // 1 px
    expect(connectedComponents(mask, w, h, 1).length).toBe(2);
    expect(connectedComponents(mask, w, h, 5).length).toBe(1);
  });
  it('gives a longer major axis for an elongated (streaked) blob', () => {
    const { mask, w, h } = blank(20, 6);
    fillRect(mask, w, 1, 3, 15, 3); // horizontal streak
    const [b] = connectedComponents(mask, w, h, 1);
    expect(b.majorLength).toBeGreaterThan(10);
    expect(Math.abs(Math.sin(b.angle))).toBeLessThan(0.2); // nearly horizontal
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- blobs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/detection/blobs.js
export function principalAxis(sxx, syy, sxy) {
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lambda = tr / 2 + disc; // larger eigenvalue (variance along major axis)
  const majorLength = 4 * Math.sqrt(Math.max(0, lambda)); // ~4 standard deviations
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { majorLength, angle };
}

export function connectedComponents(mask, width, height, minPixels = 1) {
  const labels = new Int32Array(width * height);
  const blobs = [];
  const stack = [];
  let current = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0 || labels[i] !== 0) continue;
    current++;
    stack.length = 0;
    stack.push(i);
    labels[i] = current;
    let count = 0, sumX = 0, sumY = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    const xs = [], ys = [];
    while (stack.length) {
      const p = stack.pop();
      const x = p % width;
      const y = (p - x) / width;
      count++; sumX += x; sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      xs.push(x); ys.push(y);
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = current; stack.push(p - 1); }
      if (x < width - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = current; stack.push(p + 1); }
      if (y > 0 && mask[p - width] && !labels[p - width]) { labels[p - width] = current; stack.push(p - width); }
      if (y < height - 1 && mask[p + width] && !labels[p + width]) { labels[p + width] = current; stack.push(p + width); }
    }
    if (count < minPixels) continue;
    const cx = sumX / count, cy = sumY / count;
    let sxx = 0, syy = 0, sxy = 0;
    for (let k = 0; k < xs.length; k++) {
      const dx = xs[k] - cx, dy = ys[k] - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    sxx /= count; syy /= count; sxy /= count;
    const { majorLength, angle } = principalAxis(sxx, syy, sxy);
    blobs.push({ count, cx, cy, minX, minY, maxX, maxY, majorLength, angle });
  }
  return blobs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- blobs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/detection/blobs.js test/blobs.test.js
git commit -m "feat: connected-component blob detection with principal axis"
```

---

### Task 8: Detection pipeline (`detect.js`) + synthetic frame helper

**Files:**
- Create: `src/detection/synthetic.js` (test/support helper, also used at runtime for annotated overlays if needed)
- Create: `src/detection/detect.js`
- Test: `test/detect.test.js`

**Interfaces:**
- Consumes: `absDiff`, `threshold` (Task 6); `connectedComponents` (Task 7); `fitTrajectory`, `predictAt` (Task 3).
- Produces:
  - `makeFrame(mediaTime, width, height, disc | null, bgValue = 20): GrayFrame` where
    `GrayFrame = { mediaTime, width, height, gray: Uint8Array }`, `disc = { cx, cy, r, value = 230 }`.
  - `medianBackground(frames: GrayFrame[]): GrayFrame`.
  - `detect(frames: GrayFrame[], opts?): Track` where
    `Track = { points: {t:number,x:number,y:number,streakLength:number,streakAngle:number,count:number}[], frameCount:number }`.
    `opts = { thresholdLevel = 25, minBlobPixels = 6, trajectoryTolerancePx = 40 }`.
    NOTE: `point.t` carries each frame's `mediaTime` (seconds) — the estimator relies on that.
- Consumed by: Task 9 (estimator) and Task 15 (wiring).

- [ ] **Step 1: Write the failing test**

```js
// test/detect.test.js
import { describe, it, expect } from 'vitest';
import { makeFrame, medianBackground, detect } from '../src/detection/detect.js';

describe('detection pipeline', () => {
  it('builds a background where the moving puck is removed', () => {
    // puck present in only 1 of 5 frames -> median is background (value 20)
    const W = 40, H = 20;
    const frames = [];
    for (let i = 0; i < 5; i++) {
      const disc = i === 2 ? { cx: 20, cy: 10, r: 3 } : null;
      frames.push(makeFrame(i / 60, W, H, disc));
    }
    const bg = medianBackground(frames);
    expect(bg.gray[10 * W + 20]).toBe(20);
  });

  it('recovers a constant-velocity track across frames', () => {
    const W = 200, H = 40, r = 4;
    const frames = [];
    // puck moves 10 px/frame in x, 60 fps
    for (let i = 0; i < 6; i++) {
      frames.push(makeFrame(i / 60, W, H, { cx: 30 + i * 10, cy: 20, r }));
    }
    const track = detect(frames, { thresholdLevel: 25, minBlobPixels: 3 });
    expect(track.points.length).toBeGreaterThanOrEqual(4);
    // centroid should advance ~10 px per frame
    const xs = track.points.map((p) => p.x);
    expect(xs[xs.length - 1] - xs[0]).toBeGreaterThan(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- detect`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/detection/synthetic.js
export function makeFrame(mediaTime, width, height, disc = null, bgValue = 20) {
  const gray = new Uint8Array(width * height).fill(bgValue);
  if (disc) {
    const { cx, cy, r, value = 230 } = disc;
    const r2 = r * r;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(height - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(width - 1, Math.ceil(cx + r)); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) gray[y * width + x] = value;
      }
    }
  }
  return { mediaTime, width, height, gray };
}
```

```js
// src/detection/detect.js
import { absDiff, threshold } from './frameDiff.js';
import { connectedComponents } from './blobs.js';
import { fitTrajectory, predictAt } from '../math/linefit.js';
export { makeFrame } from './synthetic.js';

export function medianBackground(frames) {
  const { width, height } = frames[0];
  const n = frames.length;
  const bg = new Uint8Array(width * height);
  const vals = new Uint8Array(n);
  for (let i = 0; i < width * height; i++) {
    for (let f = 0; f < n; f++) vals[f] = frames[f].gray[i];
    for (let a = 1; a < n; a++) {
      const v = vals[a];
      let b = a - 1;
      while (b >= 0 && vals[b] > v) { vals[b + 1] = vals[b]; b--; }
      vals[b + 1] = v;
    }
    bg[i] = vals[(n - 1) >> 1];
  }
  return { width, height, gray: bg };
}

function candidateBlobs(frame, bg, thresholdLevel, minBlobPixels) {
  const d = absDiff(frame.gray, bg.gray);
  const m = threshold(d, thresholdLevel);
  return connectedComponents(m, frame.width, frame.height, minBlobPixels);
}

function toPoint(mediaTime, b) {
  return { t: mediaTime, x: b.cx, y: b.cy, streakLength: b.majorLength, streakAngle: b.angle, count: b.count };
}

export function detect(frames, opts = {}) {
  const thresholdLevel = opts.thresholdLevel ?? 25;
  const minBlobPixels = opts.minBlobPixels ?? 6;
  const tol = opts.trajectoryTolerancePx ?? 40;
  if (frames.length < 2) return { points: [], frameCount: frames.length };

  const bg = medianBackground(frames);
  const perFrame = frames.map((fr) => ({
    mediaTime: fr.mediaTime,
    blobs: candidateBlobs(fr, bg, thresholdLevel, minBlobPixels),
  }));

  // First pass: largest blob per frame.
  let points = [];
  for (const pf of perFrame) {
    if (!pf.blobs.length) continue;
    const b = pf.blobs.reduce((m, x) => (x.count > m.count ? x : m));
    points.push(toPoint(pf.mediaTime, b));
  }

  // Second pass (trajectory consistency): re-pick the blob nearest the fitted line.
  if (points.length >= 3) {
    const fit = fitTrajectory(points);
    const refined = [];
    for (const pf of perFrame) {
      if (!pf.blobs.length) continue;
      const [px, py] = predictAt(fit, pf.mediaTime);
      let best = null, bestD = Infinity;
      for (const b of pf.blobs) {
        const dd = Math.hypot(b.cx - px, b.cy - py);
        if (dd < bestD) { bestD = dd; best = b; }
      }
      if (bestD <= tol) refined.push(toPoint(pf.mediaTime, best));
    }
    if (refined.length >= 2) points = refined;
  }

  points.sort((a, b) => a.t - b.t);
  return { points, frameCount: frames.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- detect`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/detection/synthetic.js src/detection/detect.js test/detect.test.js
git commit -m "feat: detection pipeline (median background + trajectory-consistent tracking)"
```

---

### Task 9: Hybrid speed estimator (`estimator.js`)

**Files:**
- Create: `src/speed/estimator.js`
- Test: `test/estimator.test.js`

**Interfaces:**
- Consumes: `fitTrajectory` (Task 3); `mpsToKmh` (Task 2); a `Track` (Task 8).
- Produces:
  - `estimate(track: Track, scale: { pxPerMeter: number }, opts?: { exposureTime?: number }): Result`
    where `Result = { speedMps, speedKmh, method: 'multiframe'|'streak2'|'streak1'|'none', confidence: 'high'|'medium'|'low'|'none', frameCount }`.
  - Throws if `scale.pxPerMeter` missing/≤0 (fail loud — no calibration).
- Consumed by: Task 15 (wiring).

- [ ] **Step 1: Write the failing test**

```js
// test/estimator.test.js
import { describe, it, expect } from 'vitest';
import { estimate } from '../src/speed/estimator.js';

const scale = { pxPerMeter: 100 }; // 100 px = 1 m

describe('speed estimator', () => {
  it('multi-frame: 1000 px/s at 100 px/m -> 10 m/s -> 36 km/h', () => {
    const points = [0, 1, 2, 3].map((i) => ({ t: i * 0.1, x: i * 100, y: 5, streakLength: 8, streakAngle: 0 }));
    const r = estimate({ points, frameCount: 4 }, scale);
    expect(r.method).toBe('multiframe');
    expect(r.confidence).toBe('high');
    expect(r.speedKmh).toBeCloseTo(36, 3);
  });

  it('two-frame streak fallback', () => {
    const points = [
      { t: 0, x: 0, y: 5, streakLength: 8, streakAngle: 0 },
      { t: 0.1, x: 100, y: 5, streakLength: 8, streakAngle: 0 },
    ];
    const r = estimate({ points, frameCount: 2 }, scale);
    expect(r.method).toBe('streak2');
    expect(r.confidence).toBe('medium');
    expect(r.speedKmh).toBeCloseTo(36, 3);
  });

  it('single-frame streak needs exposure time', () => {
    const points = [{ t: 0, x: 0, y: 5, streakLength: 50, streakAngle: 0 }];
    const r = estimate({ points, frameCount: 1 }, scale, { exposureTime: 0.05 });
    // 50 px / 100 px/m = 0.5 m over 0.05 s = 10 m/s = 36 km/h
    expect(r.method).toBe('streak1');
    expect(r.speedKmh).toBeCloseTo(36, 3);
  });

  it('reports none when there is nothing usable', () => {
    expect(estimate({ points: [], frameCount: 0 }, scale).method).toBe('none');
    expect(estimate({ points: [{ t: 0, x: 0, y: 0, streakLength: 5, streakAngle: 0 }], frameCount: 1 }, scale).method).toBe('none');
  });

  it('throws without calibration', () => {
    expect(() => estimate({ points: [], frameCount: 0 }, {})).toThrow(/calibration/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- estimator`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/speed/estimator.js
import { fitTrajectory } from '../math/linefit.js';
import { mpsToKmh } from '../math/units.js';

function result(mps, method, confidence, frameCount) {
  return { speedMps: mps, speedKmh: mpsToKmh(mps), method, confidence, frameCount };
}
function none(frameCount) {
  return { speedMps: 0, speedKmh: 0, method: 'none', confidence: 'none', frameCount };
}

export function estimate(track, scale, opts = {}) {
  const pxPerMeter = scale && scale.pxPerMeter;
  if (!pxPerMeter || pxPerMeter <= 0) throw new Error('calibration scale (pxPerMeter) required');
  const pts = (track && track.points) || [];

  if (pts.length >= 3) {
    const fit = fitTrajectory(pts);
    const speedPx = Math.hypot(fit.vx, fit.vy); // px per second
    return result(speedPx / pxPerMeter, 'multiframe', 'high', pts.length);
  }
  if (pts.length === 2) {
    const dt = pts[1].t - pts[0].t;
    if (dt <= 0) return none(2);
    const distPx = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    return result((distPx / pxPerMeter) / dt, 'streak2', 'medium', 2);
  }
  if (pts.length === 1 && opts.exposureTime > 0) {
    const mps = (pts[0].streakLength / pxPerMeter) / opts.exposureTime;
    return result(mps, 'streak1', 'low', 1);
  }
  return none(pts.length);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- estimator`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/speed/estimator.js test/estimator.test.js
git commit -m "feat: hybrid speed estimator (multiframe + streak fallback)"
```

---

### Task 10: Calibration + session history (`calibration.js`, `history.js`)

**Files:**
- Create: `src/calibration/calibration.js`
- Create: `src/session/history.js`
- Test: `test/calibration.test.js`

**Interfaces:**
- Produces:
  - `class Calibration` (defaults to `localStorage`, injectable storage)
    - `setFromPoints(p1: {x,y}, p2: {x,y}, meters: number, method = 'known-length'): { pxPerMeter, method }` — throws on `meters <= 0` or coincident points. All three UI methods (object length / floor marks / puck edges @ 0.0762 m) call this; only the `method` label and `meters` source differ.
    - `get(): { pxPerMeter, method } | null`, `clear(): void`.
  - `class History` (defaults to `localStorage`, `max = 3`)
    - `add(speedKmh: number): number[]` — newest first, rounded to 0.1, capped at `max`.
    - `list(): number[]`, `clear(): void`.
- Consumed by: Task 13 (UI) and Task 15 (wiring).

- [ ] **Step 1: Write the failing test**

```js
// @vitest-environment jsdom
// test/calibration.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { Calibration } from '../src/calibration/calibration.js';
import { History } from '../src/session/history.js';

beforeEach(() => localStorage.clear());

describe('Calibration', () => {
  it('derives px/m from two points and a real length', () => {
    const c = new Calibration();
    const v = c.setFromPoints({ x: 0, y: 0 }, { x: 300, y: 0 }, 1.5, 'known-length');
    expect(v.pxPerMeter).toBeCloseTo(200, 6);
    expect(c.get().method).toBe('known-length');
  });
  it('supports the puck-edge (0.0762 m) method via the same call', () => {
    const c = new Calibration();
    const v = c.setFromPoints({ x: 100, y: 50 }, { x: 138.1, y: 50 }, 0.0762, 'puck-diameter');
    expect(v.pxPerMeter).toBeCloseTo(38.1 / 0.0762, 3);
  });
  it('rejects bad input', () => {
    const c = new Calibration();
    expect(() => c.setFromPoints({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toThrow(/meters/);
    expect(() => c.setFromPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 1)).toThrow(/points/);
  });
});

describe('History', () => {
  it('keeps only the last 3 shots, newest first', () => {
    const h = new History(localStorage, 3);
    h.add(90.11); h.add(100.04); h.add(80.5); h.add(120.9);
    expect(h.list()).toEqual([120.9, 80.5, 100]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- calibration`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/calibration/calibration.js
const KEY = 'puck.calibration';

export class Calibration {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }
  setFromPoints(p1, p2, meters, method = 'known-length') {
    if (meters <= 0) throw new Error('meters must be > 0');
    const pixels = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (pixels <= 0) throw new Error('the two points must differ');
    const value = { pxPerMeter: pixels / meters, method };
    this.storage.setItem(KEY, JSON.stringify(value));
    return value;
  }
  get() {
    const raw = this.storage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  }
  clear() {
    this.storage.removeItem(KEY);
  }
}
```

```js
// src/session/history.js
const HKEY = 'puck.history';

export class History {
  constructor(storage = globalThis.localStorage, max = 3) {
    this.storage = storage;
    this.max = max;
  }
  add(speedKmh) {
    const list = this.list();
    list.unshift(Math.round(speedKmh * 10) / 10);
    while (list.length > this.max) list.pop();
    this.storage.setItem(HKEY, JSON.stringify(list));
    return list;
  }
  list() {
    const raw = this.storage.getItem(HKEY);
    return raw ? JSON.parse(raw) : [];
  }
  clear() {
    this.storage.removeItem(HKEY);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- calibration`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calibration/calibration.js src/session/history.js test/calibration.test.js
git commit -m "feat: calibration store + last-3 session history"
```

---

### Task 11: Browser capture (`capture.js`)

**Files:**
- Create: `src/capture/capture.js`
- Test: `test/capture.test.js` (tests the pure `toGray` helper only)

**Interfaces:**
- Consumes: `RingBuffer` (Task 4).
- Produces:
  - `toGray(imageData: { data: Uint8ClampedArray, width, height }): Uint8Array` (pure; luma).
  - `async startCapture({ windowMs = 600, requestedFps = 60, detectWidth = 480, onSettings? }): Promise<Capture>`
    where `Capture = { stream, video, ring, settings, detectWidth, detectHeight, stop() }`.
    Ring frames are `{ t: number(ms, wall-clock from rVFC 'now'), mediaTime: number(s), width, height, gray }`.
- Consumed by: Task 15 (wiring). Manual device verification required.

- [ ] **Step 1: Write the failing test**

```js
// test/capture.test.js
import { describe, it, expect } from 'vitest';
import { toGray } from '../src/capture/capture.js';

describe('toGray', () => {
  it('converts RGBA to luma', () => {
    // one white pixel, one black pixel
    const data = Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255]);
    const gray = toGray({ data, width: 2, height: 1 });
    expect(gray[0]).toBe(255);
    expect(gray[1]).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- capture`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/capture/capture.js
import { RingBuffer } from './ringBuffer.js';

export function toGray(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return gray;
}

export async function startCapture({ windowMs = 600, requestedFps = 60, detectWidth = 480, onSettings } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { frameRate: { ideal: requestedFps }, facingMode: 'environment' },
    audio: true,
  });
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  if (onSettings) onSettings(settings);

  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();

  const scale = detectWidth / video.videoWidth;
  const dw = detectWidth;
  const dh = Math.round(video.videoHeight * scale);
  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const ring = new RingBuffer(windowMs);
  let running = true;

  function onFrame(now, meta) {
    if (!running) return;
    ctx.drawImage(video, 0, 0, dw, dh);
    const img = ctx.getImageData(0, 0, dw, dh);
    ring.push({ t: now, mediaTime: meta.mediaTime, width: dw, height: dh, gray: toGray(img) });
    video.requestVideoFrameCallback(onFrame);
  }
  video.requestVideoFrameCallback(onFrame);

  return {
    stream, video, ring, settings, detectWidth: dw, detectHeight: dh,
    stop() {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- capture`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/capture/capture.js test/capture.test.js
git commit -m "feat: browser capture with rVFC ring buffer + luma conversion"
```

---

### Task 12: Browser audio trigger (`audioTrigger.js` + worklet)

**Files:**
- Create: `public/onset-worklet.js`
- Create: `src/audio/audioTrigger.js`
- Test: none automated (WebAudio requires a device/browser). The pure logic (`OnsetDetector`, `rmsEnergy`) is already covered by Task 5.

**Interfaces:**
- Consumes: `OnsetDetector` (Task 5); the audio track from `Capture.stream` (Task 11).
- Produces:
  - `async startAudioTrigger(stream: MediaStream, onTrigger: (triggerMs:number)=>void, opts?): Promise<{ context, arm, disarm }>`.
    `onTrigger` receives `performance.now()` (ms) — same clock as ring `frame.t`.
- Consumed by: Task 15 (wiring). Manual device verification required.

- [ ] **Step 1: Write the worklet + trigger (no test — device-only glue)**

```js
// public/onset-worklet.js
class OnsetProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      let s = 0;
      for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i];
      this.port.postMessage(Math.sqrt(s / ch.length));
    }
    return true;
  }
}
registerProcessor('onset-processor', OnsetProcessor);
```

```js
// src/audio/audioTrigger.js
import { OnsetDetector } from './onsetDetector.js';

export async function startAudioTrigger(stream, onTrigger, opts = {}) {
  const context = new AudioContext();
  await context.audioWorklet.addModule('/onset-worklet.js');
  const src = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'onset-processor');
  src.connect(node); // no connection to destination: we only measure, never play back

  const detector = new OnsetDetector(opts);
  let armed = true;
  node.port.onmessage = (ev) => {
    if (!armed) return;
    if (detector.process(ev.data, performance.now())) onTrigger(performance.now());
  };

  return {
    context,
    arm() { armed = true; },
    disarm() { armed = false; },
  };
}
```

- [ ] **Step 2: Run full suite to confirm nothing broke**

Run: `npm test`
Expected: PASS (all prior tests; no new tests added here).

- [ ] **Step 3: Commit**

```bash
git add public/onset-worklet.js src/audio/audioTrigger.js
git commit -m "feat: WebAudio worklet + audio trigger wiring"
```

---

### Task 13: UI shell, calibration flow, result + history rendering (`ui.js`)

**Files:**
- Create: `src/ui/ui.js`
- Create: `src/ui/coords.js`
- Create: `src/ui/styles.css`
- Test: `test/coords.test.js`

**Interfaces:**
- Consumes: `Calibration`, `History` (Task 10).
- Produces:
  - `cssToDetection(point: {x,y}, rect: {left,top,width,height}, detectWidth, detectHeight): {x,y}` — maps a tap in CSS/screen coords to detection-pixel space (pure; ensures calibration and detection share one coordinate system, per Global Constraints).
  - `class UI` with methods used by wiring: `renderPreview(video)`, `promptCalibration(method, onTwoPoints)`, `showResult(result)`, `renderHistory(list: number[])`, `showWarning(msg)`, `setFpsBadge(fps)`.
- Consumed by: Task 15 (wiring). UI DOM behaviour verified on device; the coordinate mapping is unit-tested here.

- [ ] **Step 1: Write the failing test**

```js
// test/coords.test.js
import { describe, it, expect } from 'vitest';
import { cssToDetection } from '../src/ui/coords.js';

describe('cssToDetection', () => {
  it('maps a screen tap into detection-pixel space', () => {
    const rect = { left: 0, top: 0, width: 360, height: 200 };
    // detection frame is 480x267; tap at centre of the element
    const p = cssToDetection({ x: 180, y: 100 }, rect, 480, 267);
    expect(p.x).toBeCloseTo(240, 3);
    expect(p.y).toBeCloseTo(133.5, 3);
  });
  it('maps the top-left corner to (0,0)', () => {
    const rect = { left: 20, top: 40, width: 360, height: 200 };
    const p = cssToDetection({ x: 20, y: 40 }, rect, 480, 267);
    expect(p).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- coords`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/ui/coords.js
export function cssToDetection(point, rect, detectWidth, detectHeight) {
  const fx = (point.x - rect.left) / rect.width;
  const fy = (point.y - rect.top) / rect.height;
  return { x: fx * detectWidth, y: fy * detectHeight };
}
```

```css
/* src/ui/styles.css */
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #0b0f14; color: #e7edf3; }
#app { display: flex; flex-direction: column; min-height: 100dvh; }
.preview { position: relative; width: 100%; background: #000; }
.preview video, .preview canvas { width: 100%; display: block; }
.overlay { position: absolute; inset: 0; }
.speed { font-size: 18vw; font-weight: 800; text-align: center; line-height: 1; }
.speed small { font-size: 5vw; opacity: 0.7; }
.confidence-low { color: #f4b740; }
.confidence-none { color: #e5484d; }
.history { display: flex; gap: 12px; justify-content: center; padding: 12px; }
.history span { font-size: 6vw; font-weight: 700; }
.badge { position: absolute; top: 8px; right: 8px; font-size: 12px; background: #1c2530; padding: 4px 8px; border-radius: 8px; }
.warn { background: #3a2a12; color: #f4b740; padding: 10px; text-align: center; }
button { font-size: 16px; padding: 12px 16px; border: 0; border-radius: 10px; background: #2b6cff; color: #fff; }
```

```js
// src/ui/ui.js
import { mpsToKmh } from '../math/units.js';

export class UI {
  constructor(root = document.getElementById('app')) {
    this.root = root;
    this.root.innerHTML = `
      <div class="preview"><div class="badge" id="fps">-- fps</div><div class="overlay" id="overlay"></div></div>
      <div id="warn"></div>
      <div class="speed" id="speed"><small>tap to calibrate</small></div>
      <div class="history" id="history"></div>
      <div style="padding:12px;text-align:center"><button id="calBtn">Calibrate (puck edges)</button></div>
    `;
    this.$speed = this.root.querySelector('#speed');
    this.$history = this.root.querySelector('#history');
    this.$warn = this.root.querySelector('#warn');
    this.$fps = this.root.querySelector('#fps');
    this.$preview = this.root.querySelector('.preview');
  }
  renderPreview(video) {
    video.classList.add('preview-video');
    this.$preview.prepend(video);
  }
  setFpsBadge(fps) {
    this.$fps.textContent = `${Math.round(fps)} fps`;
  }
  showWarning(msg) {
    this.$warn.innerHTML = msg ? `<div class="warn">${msg}</div>` : '';
  }
  showResult(result) {
    if (result.method === 'none') {
      this.$speed.innerHTML = `<span class="confidence-none">no valid shot</span>`;
      return;
    }
    const cls = result.confidence === 'low' ? 'confidence-low' : '';
    this.$speed.innerHTML =
      `<span class="${cls}">${result.speedKmh.toFixed(1)}</span><small> km/h · ${result.confidence}</small>`;
  }
  renderHistory(list) {
    this.$history.innerHTML = list.map((v) => `<span>${v.toFixed(1)}</span>`).join('');
  }
  onCalibrateClick(handler) {
    this.root.querySelector('#calBtn').addEventListener('click', handler);
  }
  // Collect two taps on the preview; resolves with the two CSS-space points + element rect.
  collectTwoTaps() {
    return new Promise((resolve) => {
      const pts = [];
      const handler = (ev) => {
        pts.push({ x: ev.clientX, y: ev.clientY });
        if (pts.length === 2) {
          this.$preview.removeEventListener('click', handler);
          resolve({ pts, rect: this.$preview.getBoundingClientRect() });
        }
      };
      this.$preview.addEventListener('click', handler);
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- coords`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/coords.js src/ui/ui.js src/ui/styles.css test/coords.test.js
git commit -m "feat: UI shell, tap->detection coord mapping, result/history rendering"
```

---

### Task 14: PWA shell (manifest + service worker)

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Create: `public/icon-192.png` (placeholder solid-colour PNG; replace with real art later)
- Create: `public/icon-512.png` (placeholder)
- Modify: `index.html` (link manifest, register SW)
- Test: none automated (install/offline verified on device).

**Interfaces:**
- Produces: an installable, offline-capable app shell. No JS API consumed by other tasks.

- [ ] **Step 1: Add manifest, service worker, and registration**

```json
// public/manifest.webmanifest
{
  "name": "Puck Speed",
  "short_name": "PuckSpeed",
  "start_url": "/",
  "display": "standalone",
  "orientation": "landscape",
  "background_color": "#0b0f14",
  "theme_color": "#0b0f14",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

```js
// public/sw.js
const CACHE = 'puck-speed-v1';
const ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/onset-worklet.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('/index.html')))
  );
});
```

Add to `index.html` `<head>`:

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#0b0f14" />
```

Add before `</body>` in `index.html`:

```html
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
      }
    </script>
```

Create the two placeholder icons (any solid PNG at the right sizes):

```bash
# from an environment with ImageMagick, or drop in real art:
# generates a solid dark square as a stand-in
magick -size 192x192 xc:#0b0f14 public/icon-192.png
magick -size 512x512 xc:#0b0f14 public/icon-512.png
```

- [ ] **Step 2: Verify build includes PWA assets**

Run: `npm run build && ls dist`
Expected: `dist/` contains `index.html`, `manifest.webmanifest`, `sw.js`, `onset-worklet.js`, and the icons.

- [ ] **Step 3: Commit**

```bash
git add public/manifest.webmanifest public/sw.js public/icon-192.png public/icon-512.png index.html
git commit -m "feat: PWA manifest + offline service worker"
```

---

### Task 15: End-to-end wiring + on-device validation (`main.js`)

**Files:**
- Modify: `src/main.js`
- Test: `test/freeze.test.js` (unit-test the pure freeze-window helper)

**Interfaces:**
- Consumes: everything above — `startCapture` (11), `startAudioTrigger` (12), `detect` (8), `estimate` (9), `Calibration`/`History` (10), `UI`/`cssToDetection` (13).
- Produces:
  - `freezeWindow(triggerMs: number, preMs = 100, postMs = 400): [number, number]` — pure `[t0, t1]` helper (testable).
  - `async function boot()` — the app orchestration (device-only).

- [ ] **Step 1: Write the failing test**

```js
// test/freeze.test.js
import { describe, it, expect } from 'vitest';
import { freezeWindow } from '../src/main.js';

describe('freezeWindow', () => {
  it('brackets the trigger with pre/post roll', () => {
    expect(freezeWindow(1000, 100, 400)).toEqual([900, 1400]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- freeze`
Expected: FAIL — `freezeWindow` not exported.

- [ ] **Step 3: Write the wiring + helper**

```js
// src/main.js
import { startCapture } from './capture/capture.js';
import { startAudioTrigger } from './audio/audioTrigger.js';
import { detect } from './detection/detect.js';
import { estimate } from './speed/estimator.js';
import { Calibration } from './calibration/calibration.js';
import { History } from './session/history.js';
import { UI } from './ui/ui.js';
import { cssToDetection } from './ui/coords.js';

export function appName() {
  return 'puck-speed';
}

export function freezeWindow(triggerMs, preMs = 100, postMs = 400) {
  return [triggerMs - preMs, triggerMs + postMs];
}

export async function boot() {
  const ui = new UI();
  const calibration = new Calibration();
  const history = new History();
  history && ui.renderHistory(history.list());

  let capture;
  try {
    capture = await startCapture({
      onSettings: (s) => {
        const fps = s.frameRate || 0;
        ui.setFpsBadge(fps);
        if (fps && fps < 50) ui.showWarning(`Only ${Math.round(fps)} fps granted — fast shots may be low-confidence.`);
      },
    });
  } catch (err) {
    ui.showWarning('Camera/mic permission is required.');
    return;
  }
  ui.renderPreview(capture.video);

  ui.onCalibrateClick(async () => {
    ui.showWarning('Tap the two edges of the puck (76.2 mm).');
    const { pts, rect } = await ui.collectTwoTaps();
    const p1 = cssToDetection(pts[0], rect, capture.detectWidth, capture.detectHeight);
    const p2 = cssToDetection(pts[1], rect, capture.detectWidth, capture.detectHeight);
    try {
      calibration.setFromPoints(p1, p2, 0.0762, 'puck-diameter');
      ui.showWarning('');
    } catch (err) {
      ui.showWarning(`Calibration failed: ${err.message}`);
    }
  });

  const trigger = await startAudioTrigger(capture.stream, (triggerMs) => {
    const scale = calibration.get();
    if (!scale) {
      ui.showWarning('Set calibration before measuring.');
      return;
    }
    trigger.disarm();
    const [t0, t1] = freezeWindow(triggerMs);
    // wait for the post-roll frames to arrive, then analyse
    setTimeout(() => {
      const frames = capture.ring.snapshot(t0, t1);
      let result;
      try {
        result = estimate(detect(frames), scale, { exposureTime: capture.settings.exposureTime });
      } catch (err) {
        ui.showWarning(err.message);
        trigger.arm();
        return;
      }
      ui.showResult(result);
      if (result.method !== 'none') ui.renderHistory(history.add(result.speedKmh));
      trigger.arm();
    }, 450);
  });
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  boot();
}
```

- [ ] **Step 4: Run test to verify it passes, then the full suite**

Run: `npm test -- freeze`
Expected: PASS (1 test).

Run: `npm test`
Expected: PASS (all tests across every task).

- [ ] **Step 5: Commit**

```bash
git add src/main.js test/freeze.test.js
git commit -m "feat: end-to-end wiring (trigger -> freeze -> detect -> estimate -> history)"
```

- [ ] **Step 6: On-device validation checklist (manual, iPhone 15 Pro Max, Chrome)**

Serve over HTTPS/localhost (getUserMedia needs a secure context). Use `npm run dev` and open via the phone on the LAN, or deploy the `dist/` build to any static HTTPS host.

  1. Grant camera + mic. Confirm the **fps badge** shows the granted rate (expect 30 or 60).
  2. Mount the phone **landscape, side-on** at the ramp exit. Place the puck in frame.
  3. **Calibrate**: tap the button, tap the two puck edges. Warning clears.
  4. Fire a shot. Confirm one **km/h** number appears and the confidence label is sensible (high for medium-speed, low for a rocket).
  5. Fire two more shots. Confirm the **last-3 history** updates, newest first.
  6. Cover the lens / block detection → confirm **"no valid shot"**, never a fabricated number.
  7. Clear calibration (via devtools `localStorage.clear()`), fire → confirm it **blocks** with the calibration warning.
  8. Enable airplane mode after first load → confirm the **PWA still loads offline** and runs.
  9. (Accuracy) Roll a puck at a known/measured speed across the frame; compare the reading. Record the delta for tuning `thresholdLevel` / `minBlobPixels`.

- [ ] **Step 7: Commit any device-tuning changes**

```bash
git add -A
git commit -m "chore: device-tuning adjustments from on-iPhone validation"
```

---

## Self-Review

**Spec coverage:**
- In-browser PWA, no server → Tasks 1, 14. ✓
- iOS/WebKit fps reality + auto-detect granted fps → Task 11 (`onSettings`), Task 15 (fps badge + <50 warning). ✓
- Frame ring buffer with timestamps + pre-trigger frames → Tasks 4, 11, 15 (`freezeWindow` pre-roll). ✓
- Mic-as-trigger, one-shot with refractory → Tasks 5, 12. ✓
- Background-agnostic detection (puck = only mover) → Task 8 (median background + differencing). ✓
- Hybrid estimator A + B with method/confidence → Task 9. ✓
- Three calibration methods reduced to one math path → Task 10 + Task 15 (puck-edge default). ✓
- km/h output + last-3 history → Tasks 9, 10, 13, 15. ✓
- Fail loud, never fabricate → Task 9 (throws w/o calibration; `none`), Task 15 (warnings, "no valid shot"). ✓
- Synthetic-frame accuracy validation → Task 8 test; math tests Tasks 2, 3, 9. ✓
- Detection/calibration share coordinate space → Task 13 (`cssToDetection`) + Global Constraints. ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" left. The only intentional stand-ins are the solid-colour PWA icons (Task 14), explicitly flagged as replaceable art, not logic gaps.

**Type consistency:** `Track = { points, frameCount }` produced by `detect` (Task 8) and consumed by `estimate` (Task 9) match. `point` fields (`t, x, y, streakLength, streakAngle, count`) are consistent across Tasks 8/9. `scale = { pxPerMeter }` produced by `Calibration.setFromPoints` (Task 10) and consumed by `estimate` (Task 9) match. Ring frame time field `t` (ms) is consistent across Tasks 4, 11, 15; `mediaTime` (s) consistent across Tasks 8, 11.

## Open items for later (not in this plan)
- Two-sound time-of-flight mode.
- Perspective correction for non-perpendicular mounts.
- Real app icon art; auto exposure-time calibration for the single-frame streak path.
