# Puck Speed — Design Spec

**Date:** 2026-07-22
**Status:** Approved design, pre-implementation
**Topic:** In-browser mobile web app that measures the speed of an ice-hockey puck shot from a shooting ramp, using the phone's microphone as a shot trigger and the camera for vision-based speed measurement.

---

## 1. Goal & scope

A single-page, installable (PWA) web app that runs **100% in-browser on a mobile phone** (target: Chrome on an iPhone 15 Pro Max) and reports the **speed in km/h** of an ice-hockey puck launched from a shooting ramp.

- The **microphone is purely a start trigger** — it detects the sharp acoustic transient ("crack") of the shot and freezes a short buffer of camera frames.
- The **camera does the measurement** — the puck is tracked across the buffered frames and its speed computed from displacement over precisely-timestamped frames (with a motion-blur streak fallback for the fastest shots).
- Speed is measured **right off the ramp** (muzzle/launch speed), phone mounted **fixed, landscape, side-on**.
- Output: a single **km/h** readout per shot, plus a **session history of the last 3 shots**.

### Out of scope for v1
- Two-sound time-of-flight measurement (mic as timing gate) — mic is trigger only.
- Real-time/live tracking — we record-then-analyze a buffered clip.
- Server/backend, accounts, cloud storage, leaderboards beyond the local last-3 list.
- Saving/exporting clips beyond the on-screen annotated result.

---

## 2. Platform reality & constraints (design drivers)

These facts shaped the whole design and must be respected:

1. **"Chrome on iPhone" = WebKit.** Apple requires all iOS browsers to use the WebKit engine. Chrome on iOS behaves exactly like Safari for camera/mic APIs. There is no Blink/V8 camera stack on iOS.
2. **Frame rate ceiling.** In-browser `getUserMedia` on iOS realistically yields **30–60 fps**. The phone's 120/240 fps native "slo-mo" is **not** exposed to web pages. The app is designed for **60 fps** and adapts to whatever is actually granted.
3. **Device auto-detection is partial.** We cannot reliably identify the exact model (iOS hides it), but we **can** read the actual granted frame rate and camera capabilities at runtime (`track.getSettings()` / `getCapabilities()`), and use precise per-frame timestamps via `requestVideoFrameCallback`. The app self-calibrates to the hardware rather than hard-coding assumptions.
4. **Motion blur is expected, not an error.** At 60 fps a 30 m/s shot moves ~0.5 m/frame and a 44 m/s (160 km/h) shot ~0.7 m/frame, producing ~2–4 usable frames and a visible blur streak. The design **uses** the streak rather than fighting it.

### Accuracy envelope (honest)
- Typical shots (≈20–35 m/s): ~3–4 clean frames → good multi-frame fit.
- Top-end slapshots (≈40–45 m/s): ~2–3 frames, heavier blur → lower-confidence streak-based estimate.
- Every result is labelled with the estimator used and a confidence flag. The app never fabricates a number when detection is inadequate.

---

## 3. Architecture

Single-page PWA, all processing on-device. Seven modules with well-defined interfaces:

```
 getUserMedia(video + audio)
        │
   ┌────┴─────────────────────────┐
   ▼                              ▼
[Frame Ring Buffer]         [Audio Onset Detector]
 (rVFC, ~0.6s, timestamped)   (WebAudio AudioWorklet)
   │                              │  trigger(t)
   └──────────────┬───────────────┘
                  ▼
          [Buffer Freeze]  → frames[t−100ms … t+400ms]
                  ▼
          [Detection Pipeline] ── uses ── [Calibration store: px/m]
                  ▼
          [Speed Estimator (hybrid A + B)]
                  ▼
          [UI + Session History (last 3)]
```

### Module responsibilities

| Module | Responsibility | Key interface | Depends on |
|---|---|---|---|
| **Capture** | Acquire the media stream; play it to a hidden `<video>`; run the `requestVideoFrameCallback` loop; maintain the timestamped frame ring buffer. | `start()`, `stop()`, `getRingSnapshot(t0,t1)`, `settings()` | getUserMedia |
| **Audio trigger** | Detect the shot transient from the audio track and emit a trigger timestamp. | `onTrigger(cb)`, `arm()`, `disarm()` | WebAudio, shared stream |
| **Buffer freeze** | On trigger, snapshot ring frames in the window and halt overwrite during analysis. | `freeze(triggerTime) → Frame[]` | Capture |
| **Detection** | Isolate the moving puck across frames (frame differencing → blob), reject non-puck blobs, extract centroid + streak geometry per frame. | `detect(Frame[]) → Track` | — |
| **Speed estimator** | Convert a `Track` + calibration scale into a speed with method + confidence. | `estimate(Track, scale) → Result` | Calibration |
| **Calibration** | Store/retrieve px-per-metre via method (a), (b), or (c). | `set(method, params)`, `get() → scale?` | localStorage |
| **UI / session** | Preview, calibration flow, armed state, result display, last-3 history, diagnostics. | — | all above |

---

## 4. Capture path (enabling core)

- Single `getUserMedia({ video: { frameRate: 60, facingMode: 'environment' }, audio: true })`. Request 60 fps; **read back the granted rate** with `track.getSettings()` and surface it in diagnostics.
- Hidden `<video>` plays the stream. A **`requestVideoFrameCallback`** loop grabs each frame into a **ring buffer** of downscaled `ImageBitmap`s (~0.6 s ≈ 36 frames @60fps), each tagged with the callback's `mediaTime` for exact timing.
- The ring buffer gives us both **precise per-frame timestamps** and **pre-trigger frames** (the puck is already moving when the crack is heard).
- Detection runs on a downscaled copy (~480 px wide) for speed; full-resolution frames are retained only for the final annotated display.

---

## 5. Trigger + freeze

- The audio track feeds a WebAudio **AudioWorklet** computing short-window energy; an **adaptive onset detector** fires on the sharp transient, with a **refractory window** so one shot yields exactly one trigger.
- On trigger, snapshot `frames[t−100ms … t+400ms]` from the ring and stop overwriting it while analysis runs, then re-arm.

---

## 6. Detection pipeline (background-agnostic)

Because the puck is the **only moving object**, the background does not need to be understood:

1. **Consecutive-frame differencing** → threshold → binary motion mask.
2. **Connected-components** on the mask; candidate blobs extracted.
3. **Puck selection** by trajectory consistency: fast, roughly-linear motion that traverses and exits the frame; stick/hand/noise blobs rejected by size gating and motion coherence.
4. Per-frame extraction: **centroid**, bounding box, and **major-axis length + orientation** (the motion-blur streak).

Output is a `Track`: an ordered list of `{ mediaTime, centroid, streakLength, streakAngle }`.

---

## 7. Hybrid speed estimator (approach C)

One detection pipeline, two estimators, automatic selection:

- **Estimator A — multi-frame (≥3 good centroids):** linear regression of position vs. `mediaTime` → px/s → m/s via calibration scale. Preferred; most accurate.
- **Estimator B — streak fallback (1–2 frames):** displacement of streak endpoints across 2 frames, or on a lone frame `streakLength ÷ exposureTime`. Exposure from `track.getSettings().exposureTime` when iOS exposes it, otherwise a one-time calibration constant.
- **Selector** picks the best available estimate and returns `{ speed_kmh, method, confidence, frameCount }`. A rocket that produced only 2 blurry frames is labelled lower-confidence — never presented as a clean fit.

---

## 8. Calibration (all three optional)

Set once, stored in `localStorage`. Measurement is **blocked until a scale is set** (no scale → no honest m/s). The reference must sit in the **puck's travel plane at the ramp exit**; phone side-on and roughly perpendicular so px/m is ~constant along the path.

- **(a) Known-length object:** tap the two ends of an object of known length in the frame.
- **(b) Two floor marks:** tap two marked floor points, enter the measured distance between them.
- **(c) Distance + puck diameter:** enter camera-to-puck distance; use the standard **76.2 mm** puck diameter as the ruler.

Assumption documented in-app: near-perpendicular side-on mount; oblique angles introduce perspective scale error.

---

## 9. Output, history, diagnostics

- **Result screen:** large **km/h** number, method + confidence, and the buffered frames with the puck path drawn on top.
- **Session history:** last **3 shots' km/h**, persisted in `localStorage`.
- **Diagnostics — fail loud, never fake a number:**
  - Warn if granted fps < ~50.
  - Warn if frames too dark or blur streak longer than the field of view (speed would be underestimated/uncertain).
  - Block measurement if no calibration set.
  - If detection is ambiguous or frames too few, report **"no valid shot"** — not a fabricated speed.

---

## 10. Tech stack

- **Vanilla JS + Vite** build.
- **Canvas-based image ops hand-rolled** (no OpenCV.js — too heavy for iOS WebKit).
- **PWA:** manifest + service worker for offline install.
- **Storage:** `localStorage` for calibration and last-3 history.

---

## 11. Testing strategy

- **Math unit tests (headless/node):** pixel-scale conversion, linear-fit velocity, streak-length speed.
- **Detection pipeline tests against synthetic frames:** render a disc moving at a *known* velocity onto a canvas, run the full pipeline, assert recovered speed within tolerance (this validates accuracy against ground truth).
- **Onset detector tests:** synthetic audio buffers with/without a transient; assert single trigger and correct refractory behaviour.
- **Manual real-world validation:** on the target iPhone, compare against a known-speed roll / measured shot.
- **Device probe:** confirm granted fps and camera capabilities on the actual device.

---

## 12. Open items / future (not v1)

- Two-sound time-of-flight mode (mic as timing gate) for speed without vision.
- Longer session history / export / clip saving.
- Perspective correction for non-perpendicular mounts.
- Optional bright puck sticker workflow to simplify detection in poor lighting.
