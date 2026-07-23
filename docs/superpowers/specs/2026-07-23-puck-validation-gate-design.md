# Puck-validation gate: cross-travel size + adjustable min-speed

Date: 2026-07-23
Status: approved (design)

## Problem

After a real shot the speed reading is good, but **between shots the app emits
many bogus readings**. The pipeline has two gates and neither asks "was that a
puck?":

1. **Audio onset trigger** (`onsetDetector.js`) fires on any loud transient
   (voices, bumps, other players), then freezes ~0.5 s of frames and runs
   detection.
2. **Speed estimator** (`estimator.js`) returns a number whenever any two blobs
   form a 5–250 km/h line inside the ROI band.

So an ambient noise trips the trigger and whatever moved in frame (a hand, a
body, a shadow) gets fit to a plausible line and reported.

This design adds the missing "does it look and behave like a puck?" gate along
two axes: **cross-travel size** and a **user-adjustable minimum speed**. The
audio trigger is deliberately left alone — a puck crack, a stick slap and a
shout are all loud broadband transients, so audio cannot separate them; the
leverage is in the visual/speed gates.

## Non-goals

- No change to the audio trigger, calibration, capture, or history storage.
- No manual "Arm" button (kept in reserve if these gates still leak).
- No confidence-based history filtering beyond what already exists.

## Approach

### 1. Cross-travel size gate (detection layer — `detect.js`)

`candidateBlobs` already filters blobs to the puck's travel band and drops
oversized ones (`detect.js:23-40`). Extend that filter to gate on **cross-travel
thickness**.

Rationale — motion blur: a resting puck is a compact circle ≈ `puckHeightPx` in
both dimensions. A moving puck **smears along the travel direction** across the
exposure, so its along-travel width (and pixel area `count`) grow with speed,
but its **cross-travel thickness stays ≈ the puck diameter**. Travel is
essentially horizontal here (ROI is a thin band with a left/right direction), so
the stable dimension is blob **height** `maxY - minY`. Gating on area or overall
bbox would reject fast shots — exactly the ones we want.

Change:
- Thread `puckHeightPx` into `opts.roi` (source: `puckGeom.heightPx`, already
  built in `main.js`).
- Accept a blob only if
  `LO * puckHeightPx <= (maxY - minY) <= HI * puckHeightPx`.
- Tunable module constants: `PUCK_HEIGHT_LO = 0.5`, `PUCK_HEIGHT_HI = 2.5`.
  This replaces the current loose `roi.maxHeight` upper cap with a puck-relative
  band that also enforces a floor (rejects sub-puck speckle) and a tighter
  ceiling (rejects torso/hand/shadow blobs that span many puck-heights).
- Gating happens at **detection**, not estimation: a non-puck blob never becomes
  a track point.

When `puckHeightPx` is absent (uncalibrated / tests without a puck size), the
size gate is skipped — existing behaviour is preserved.

### 2. Adjustable minimum-speed level (estimator + settings + UI)

`MIN_MOVING_KMH = 5` is hardcoded (`estimator.js:6`) — too low; slow human
motion clears it. Make it a user-adjustable level.

- **Estimator:** `estimate(track, scale, { minMovingKmh })`. The RANSAC
  hypothesis filter (`estimator.js:38`) uses the passed value; the module
  constant `5` becomes the default when the option is absent (test-safe).
- **Settings:** new persisted key `minSpeedKmh` in `Settings`, with
  `getMinSpeed()` / `setMinSpeed(kmh)`. Allowed range **5–40 km/h in steps of
  5** (5, 10, 15, 20, 25, 30, 35, 40). `setMinSpeed` **clamps and snaps** any
  input to the nearest valid step; `getMinSpeed` returns the default **20** when
  unset or invalid. Follows the existing `_all()/_set()` idiom.
- **UI:** a compact **stepper** control group in `.controls`,
  `[−] Min 20 km/h [+]`, styled like the existing toggle buttons. `−`/`+`
  decrement/increment by 5, clamped at 5 and 40. A `setMinSpeedLabel(kmh)`
  method updates the text; `onMinSpeedClick(dir, handler)` wires the two
  buttons. (Alternative considered: a single tap-cycle button wrapping 5→40→5 —
  rejected because 8 steps is awkward to cycle on overshoot.)

### 3. Wiring (`main.js`)

In the trigger handler:
- Add `puckHeightPx: puckGeom.heightPx` to the `roi` object (`main.js:133-140`).
- Read `settings.getMinSpeed()` and pass `minMovingKmh` into the `estimate`
  opts (`main.js:143`).

In `boot()` / `wireAfterStart`:
- Initialise the min-speed label from `settings.getMinSpeed()`.
- Wire `−`/`+` handlers to `settings.setMinSpeed(...)` and refresh the label.

## Behavioural contract

- A blob failing the size gate is dropped in detection; a fit failing the
  min-speed gate resolves via the existing `method: 'none'` path — shown as
  "no valid shot" and **not logged to history** (guard already at
  `main.js:150`). No new silent-pass path; consistent with the repo's fail-loud
  style.
- Size gate and min-speed default are chosen so a normal firm shot passes
  comfortably (>20 km/h, puck-height streak) while walking/hand motion is
  rejected.

## Testing

- **detect / blobs:** synthetic in-band blobs — a torso-height blob
  (`> HI * puckHeightPx`) is rejected; a sub-puck speck (`< LO * puckHeightPx`)
  is rejected; a puck-height horizontal streak is kept. Verify the gate is
  skipped when `puckHeightPx` is absent.
- **estimator:** a line below `minMovingKmh` → `none`; above → reported.
  Parametrize the test over `minMovingKmh` (e.g. 20 rejects a 15 km/h line that
  the default 5 would accept).
- **settings:** `setMinSpeed` clamps (`3 → 5`, `100 → 40`) and snaps
  (`17 → 15`); persists across instances; `getMinSpeed` default is 20.

## Files touched

- `src/detection/detect.js` — size-gate constants + ROI thickness filter.
- `src/speed/estimator.js` — `minMovingKmh` option.
- `src/session/settings.js` — `getMinSpeed` / `setMinSpeed`.
- `src/ui/ui.js` — min-speed stepper markup, label setter, click wiring.
- `src/main.js` — thread `puckHeightPx` and `minMovingKmh`; wire stepper.
- `test/` — new/updated tests per above.
