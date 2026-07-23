# Puck-Validation Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop bogus between-shot readings by adding a cross-travel blob-size gate in detection and a user-adjustable minimum-speed level in the estimator/UI.

**Architecture:** Two independent rejection gates layered onto the existing pipeline. (1) `detect.js`'s ROI blob filter gains a puck-relative *height* band (cross-travel thickness, which motion blur leaves ≈ puck diameter). (2) `estimator.js`'s RANSAC minimum-speed threshold becomes an option fed from a persisted `Settings` value, adjusted via a `−/+` stepper in the UI and wired through `main.js`. Failures fall through to the existing `method:'none'` path (shown, not logged).

**Tech Stack:** Vanilla ES modules, Vite, Vitest (+ jsdom for DOM tests), localStorage.

## Global Constraints

- Node is not on the shell PATH — prefix test/build commands with `export PATH="/c/Program Files/nodejs:$PATH"; ` (bash).
- Test runner: Vitest. Single file: `npx vitest run <file>`. Full suite: `npm test`.
- DOM tests need jsdom: put `// @vitest-environment jsdom` as the file's first line (see `test/settings.test.js`).
- SI/real units elsewhere in the repo, but speeds in this feature are in **km/h** throughout (matches `estimator.js` / `Settings`).
- Puck diameter reference already exists as `puckGeom.heightPx` (px), captured at calibration in `main.js`.
- Preserve the repo's fail-loud contract: no silent passes; a rejected blob/fit yields `method:'none'`, which the UI shows as "no valid shot" and `main.js:150` already keeps out of history.

---

### Task 1: Adjustable minimum-speed option in the estimator

**Files:**
- Modify: `src/speed/estimator.js` (constant `MIN_MOVING_KMH` at line 6; RANSAC filter at line 38; `estimate` signature at line 21)
- Test: `test/estimator.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `estimate(track, scale, opts)` now reads `opts.minMovingKmh` (number, km/h). When absent it defaults to the existing module constant `MIN_MOVING_KMH` (5). All current call sites keep working unchanged.

- [ ] **Step 1: Write the failing test**

Add to `test/estimator.test.js` (a 15 km/h line: 4.1667 m/s × 100 px/m = 416.667 px/s, i.e. 41.6667 px per 0.1 s step):

```javascript
  it('rejects a line below the configured minMovingKmh', () => {
    const points = [0, 1, 2, 3].map((i) => ({ t: i * 0.1, x: i * 41.6667, y: 5, streakLength: 8, streakAngle: 0 }));
    const track = { points, frameCount: 4 };
    // ~15 km/h: accepted with the default floor (5)...
    expect(estimate(track, scale).speedKmh).toBeCloseTo(15, 1);
    // ...but rejected when the floor is raised to 20.
    expect(estimate(track, scale, { minMovingKmh: 20 }).method).toBe('none');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Program Files/nodejs:$PATH"; npx vitest run test/estimator.test.js`
Expected: FAIL — the `minMovingKmh: 20` case still returns `multiframe` (option ignored).

- [ ] **Step 3: Write minimal implementation**

In `src/speed/estimator.js`, thread the option into the RANSAC loop. Change the filter line (currently `if (kmh < MIN_MOVING_KMH || kmh > MAX_PLAUSIBLE_KMH) continue;`) to use a local resolved from opts. Add near the top of `estimate` (after `const pts = ...`):

```javascript
  const minMovingKmh = opts.minMovingKmh ?? MIN_MOVING_KMH;
```

Then in the RANSAC pair loop, replace the guard with:

```javascript
        if (kmh < minMovingKmh || kmh > MAX_PLAUSIBLE_KMH) continue;
```

Leave `MIN_MOVING_KMH = 5` as the module default.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Program Files/nodejs:$PATH"; npx vitest run test/estimator.test.js`
Expected: PASS (all estimator tests, including the 4 pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/speed/estimator.js test/estimator.test.js
git commit -m "feat(estimator): accept an adjustable minMovingKmh floor"
```

---

### Task 2: Cross-travel size gate in detection

**Files:**
- Modify: `src/detection/detect.js` (`candidateBlobs` ROI filter at lines 27-39)
- Test: `test/detect.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `detect(frames, opts)` — `opts.roi` gains an optional `puckHeightPx` (number, px). When present, a blob is kept only if `PUCK_HEIGHT_LO * puckHeightPx <= (maxY - minY) <= PUCK_HEIGHT_HI * puckHeightPx` (constants 0.5 and 2.5). When absent, the previous `roi.maxHeight` upper-cap behaviour is retained (backward compatible).

- [ ] **Step 1: Write the failing test**

Add to `test/detect.test.js`. These build a moving blob of a chosen radius; a disc of radius `r` produces a diff-blob height ≈ `2r+1`:

```javascript
  it('rejects blobs far taller than the calibrated puck height', () => {
    const W = 200, H = 80;
    const roiBase = { centerY: 40, halfHeight: 35, dir: 'right', boundX: 10 };
    const bigFrames = [];
    for (let i = 0; i < 6; i++) bigFrames.push(makeFrame(i / 60, W, H, { cx: 40 + i * 10, cy: 40, r: 15 })); // ~31 px tall
    // With a puck ~9 px tall, a 31 px blob is > 2.5x -> rejected -> no track.
    const gated = detect(bigFrames, { thresholdLevel: 25, minBlobPixels: 3, roi: { ...roiBase, puckHeightPx: 9 } });
    expect(gated.points.length).toBe(0);
    // Same blob with no puckHeightPx (uncalibrated) is still tracked.
    const ungated = detect(bigFrames, { thresholdLevel: 25, minBlobPixels: 3, roi: { ...roiBase, maxHeight: 100 } });
    expect(ungated.points.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps a puck-height streak within the size band', () => {
    const W = 200, H = 80;
    const roi = { centerY: 40, halfHeight: 35, dir: 'right', boundX: 10, puckHeightPx: 9 };
    const frames = [];
    for (let i = 0; i < 6; i++) frames.push(makeFrame(i / 60, W, H, { cx: 40 + i * 10, cy: 40, r: 4 })); // ~9 px tall
    const track = detect(frames, { thresholdLevel: 25, minBlobPixels: 3, roi });
    expect(track.points.length).toBeGreaterThanOrEqual(4);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Program Files/nodejs:$PATH"; npx vitest run test/detect.test.js`
Expected: FAIL — the "rejects blobs far taller" case tracks the big blob because `puckHeightPx` is ignored.

- [ ] **Step 3: Write minimal implementation**

In `src/detection/detect.js`, add module constants below the imports (after line 3):

```javascript
// Cross-travel thickness band, relative to the calibrated puck height. Motion
// blur stretches a blob along travel but leaves its perpendicular (vertical)
// extent ~= the puck diameter, so we gate on height, not area.
const PUCK_HEIGHT_LO = 0.5;
const PUCK_HEIGHT_HI = 2.5;
```

Replace the `if (roi) { blobs = blobs.filter(...) }` body in `candidateBlobs` with:

```javascript
  if (roi) {
    // Keep only blobs near the puck's travel line, matching the puck's
    // cross-travel thickness, and downrange of the launch point (past roi.boundX
    // in the shot direction) — excludes the shooter/stick/sheet and the static
    // cluster at the puck's resting spot.
    blobs = blobs.filter((b) => {
      if (b.cy < roi.centerY - roi.halfHeight || b.cy > roi.centerY + roi.halfHeight) return false;
      const heightPx = b.maxY - b.minY;
      if (roi.puckHeightPx != null) {
        if (heightPx < PUCK_HEIGHT_LO * roi.puckHeightPx || heightPx > PUCK_HEIGHT_HI * roi.puckHeightPx) return false;
      } else if (roi.maxHeight != null && heightPx > roi.maxHeight) {
        return false;
      }
      if (roi.boundX != null && (roi.dir === 'left' ? b.cx >= roi.boundX : b.cx <= roi.boundX)) return false;
      return true;
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Program Files/nodejs:$PATH"; npx vitest run test/detect.test.js`
Expected: PASS (both new tests and the 2 pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/detection/detect.js test/detect.test.js
git commit -m "feat(detect): gate blobs on cross-travel size vs puck height"
```

---

### Task 3: Persisted min-speed setting

**Files:**
- Modify: `src/session/settings.js` (add methods alongside `getUnit`/`setUnit`)
- Test: `test/settings.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Settings#getMinSpeed()` → number in {5,10,…,40}, default **20**. `Settings#setMinSpeed(kmh)` → clamps to [5,40] and snaps to the nearest multiple of 5, persists under key `minSpeedKmh`, returns the stored value.

- [ ] **Step 1: Write the failing test**

Add to `test/settings.test.js`:

```javascript
  it('defaults min speed to 20 km/h', () => {
    expect(new Settings().getMinSpeed()).toBe(20);
  });
  it('clamps and snaps min speed to 5..40 in steps of 5', () => {
    const s = new Settings();
    expect(s.setMinSpeed(3)).toBe(5);     // clamp low
    expect(s.setMinSpeed(100)).toBe(40);  // clamp high
    expect(s.setMinSpeed(17)).toBe(15);   // snap to nearest 5
    expect(new Settings().getMinSpeed()).toBe(15); // persisted
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Program Files/nodejs:$PATH"; npx vitest run test/settings.test.js`
Expected: FAIL — `getMinSpeed`/`setMinSpeed` are not functions.

- [ ] **Step 3: Write minimal implementation**

In `src/session/settings.js`, add inside the class (after `setUnit`):

```javascript
  getMinSpeed() {
    const v = this._all().minSpeedKmh;
    return Number.isFinite(v) && v >= 5 && v <= 40 && v % 5 === 0 ? v : 20;
  }
  setMinSpeed(kmh) {
    let v = Math.round(Number(kmh) / 5) * 5;
    if (!Number.isFinite(v)) v = 20;
    v = Math.min(40, Math.max(5, v));
    this._set({ minSpeedKmh: v });
    return this.getMinSpeed();
  }
```

Also update the top-of-file comment to mention the min-speed floor.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Program Files/nodejs:$PATH"; npx vitest run test/settings.test.js`
Expected: PASS (new + 3 pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/session/settings.js test/settings.test.js
git commit -m "feat(settings): persist an adjustable min-speed floor (5-40 km/h)"
```

---

### Task 4: Min-speed stepper in the UI

**Files:**
- Modify: `src/ui/ui.js` (controls markup in the constructor; add `setMinSpeedLabel` and `onMinSpeedClick`)
- Test: `test/ui.test.js` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `UI#setMinSpeedLabel(kmh)` sets the middle button's text to `Min <kmh> km/h`. `UI#onMinSpeedClick(dir, handler)` attaches `handler` to the `−` button when `dir === 'down'` and the `+` button when `dir === 'up'`.

- [ ] **Step 1: Write the failing test**

Create `test/ui.test.js`:

```javascript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { UI } from '../src/ui/ui.js';

function mount() {
  document.body.innerHTML = '<div id="app"></div>';
  return new UI();
}

describe('UI min-speed stepper', () => {
  it('renders the stepper and updates its label', () => {
    const ui = mount();
    ui.setMinSpeedLabel(20);
    expect(document.querySelector('#minSpeedBtn').textContent).toBe('Min 20 km/h');
    ui.setMinSpeedLabel(35);
    expect(document.querySelector('#minSpeedBtn').textContent).toBe('Min 35 km/h');
  });
  it('routes − and + clicks to their handlers', () => {
    const ui = mount();
    let down = 0, up = 0;
    ui.onMinSpeedClick('down', () => down++);
    ui.onMinSpeedClick('up', () => up++);
    document.querySelector('#minDownBtn').click();
    document.querySelector('#minUpBtn').click();
    expect([down, up]).toEqual([1, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Program Files/nodejs:$PATH"; npx vitest run test/ui.test.js`
Expected: FAIL — `#minSpeedBtn` is null / `setMinSpeedLabel` is not a function.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/ui.js`, add the stepper to the `.controls` block in the constructor template, right after the `unitBtn` line:

```html
        <span class="minspeed">
          <button id="minDownBtn" class="secondary">−</button>
          <button id="minSpeedBtn" class="readonly">Min 20 km/h</button>
          <button id="minUpBtn" class="secondary">+</button>
        </span>
```

Cache the element in the constructor (near the other `this.$…` assignments):

```javascript
    this.$minSpeed = this.root.querySelector('#minSpeedBtn');
```

Add the two methods to the class (near `onUnitClick`):

```javascript
  setMinSpeedLabel(kmh) {
    this.$minSpeed.textContent = `Min ${kmh} km/h`;
  }
  onMinSpeedClick(dir, handler) {
    this.root.querySelector(dir === 'up' ? '#minUpBtn' : '#minDownBtn').addEventListener('click', handler);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Program Files/nodejs:$PATH"; npx vitest run test/ui.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ui.js test/ui.test.js
git commit -m "feat(ui): add a min-speed -/+ stepper control"
```

---

### Task 5: Wire the gates into the live pipeline

**Files:**
- Modify: `src/main.js` (`boot` — init label + stepper handlers, near lines 26-38; `wireAfterStart` trigger handler — `roi` at lines 133-140 and `estimate` at line 143)
- Test: full suite + production build (no new unit test; `main.js` is the orchestration seam exercised by `test/smoke.test.js` and the build)

**Interfaces:**
- Consumes: `Settings#getMinSpeed`/`setMinSpeed` (Task 3), `UI#setMinSpeedLabel`/`onMinSpeedClick` (Task 4), `detect` `roi.puckHeightPx` (Task 2), `estimate` `opts.minMovingKmh` (Task 1).
- Produces: nothing downstream.

- [ ] **Step 1: Wire the stepper in `boot`**

In `src/main.js`, after the existing `ui.setDirLabel(settings.getDirection());` line, add:

```javascript
  ui.setMinSpeedLabel(settings.getMinSpeed());
```

And after the `ui.onDirClick(...)` block, add:

```javascript
  ui.onMinSpeedClick('down', () => ui.setMinSpeedLabel(settings.setMinSpeed(settings.getMinSpeed() - 5)));
  ui.onMinSpeedClick('up', () => ui.setMinSpeedLabel(settings.setMinSpeed(settings.getMinSpeed() + 5)));
```

- [ ] **Step 2: Thread `puckHeightPx` and `minMovingKmh` in `wireAfterStart`**

In the `roi` object, replace the `maxHeight` line with:

```javascript
              puckHeightPx: puckGeom.heightPx,
```

Change the estimate call from `estimate(track, scale, { exposureTime })` to:

```javascript
        result = estimate(track, scale, { exposureTime, minMovingKmh: settings.getMinSpeed() });
```

- [ ] **Step 3: Run the full suite**

Run: `export PATH="/c/Program Files/nodejs:$PATH"; npm test`
Expected: PASS — all test files green (estimator, detect, settings, ui, smoke, and the untouched rest).

- [ ] **Step 4: Verify the production build**

Run: `export PATH="/c/Program Files/nodejs:$PATH"; npm run build`
Expected: Vite build completes with no errors and writes `dist/`.

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat: wire size gate + adjustable min-speed into the shot pipeline"
```

---

## Self-Review

**Spec coverage:**
- Cross-travel size gate (`detect.js`, height band 0.5×–2.5×, skip when uncalibrated) → Task 2. ✓
- Min-speed option in estimator → Task 1. ✓
- Persisted adjustable min-speed 5–40 step 5, default 20 → Task 3. ✓
- UI `−/+` stepper → Task 4. ✓
- Wiring `puckHeightPx` + `minMovingKmh`; init label + handlers → Task 5. ✓
- Fail-loud `none` path unchanged (no history log) → preserved; no task modifies `main.js:150` or `showResult`. ✓
- Testing bullets (detect size, estimator floor, settings clamp/snap/persist) → Tasks 2/1/3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `getMinSpeed`/`setMinSpeed`, `setMinSpeedLabel`/`onMinSpeedClick`, `roi.puckHeightPx`, `opts.minMovingKmh`, and constants `PUCK_HEIGHT_LO`/`PUCK_HEIGHT_HI` are named identically across the tasks that define and consume them. ✓
