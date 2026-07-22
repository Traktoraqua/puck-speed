import { absDiff, threshold } from './frameDiff.js';
import { connectedComponents } from './blobs.js';
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

function candidateBlobs(frame, bg, thresholdLevel, minBlobPixels, roi) {
  const d = absDiff(frame.gray, bg.gray);
  const m = threshold(d, thresholdLevel);
  let blobs = connectedComponents(m, frame.width, frame.height, minBlobPixels);
  if (roi) {
    // Keep only blobs near the puck's travel line, no taller than a few puck
    // heights, and to the right of the launch point (roi.minX) — excludes the
    // shooter/stick/sheet and the static cluster at the puck's resting spot.
    blobs = blobs.filter(
      (b) =>
        b.cy >= roi.centerY - roi.halfHeight &&
        b.cy <= roi.centerY + roi.halfHeight &&
        b.maxY - b.minY <= roi.maxHeight &&
        (roi.minX == null || b.cx > roi.minX)
    );
  }
  return blobs;
}

function toPoint(time, b) {
  return { t: time, x: b.cx, y: b.cy, streakLength: b.majorLength, streakAngle: b.angle, count: b.count };
}

// Reliable per-frame time in seconds: prefer the capture wall-clock `t` (ms),
// since iOS/WebKit often leaves rVFC mediaTime at 0. Synthetic test frames carry
// only mediaTime, so fall back to it.
function frameTime(fr) {
  return fr.t != null ? fr.t / 1000 : fr.mediaTime;
}

export function detect(frames, opts = {}) {
  const thresholdLevel = opts.thresholdLevel ?? 25;
  const minBlobPixels = opts.minBlobPixels ?? 6;
  if (frames.length < 2) return { points: [], frameCount: frames.length };

  const bg = medianBackground(frames);
  const perFrame = frames.map((fr) => ({
    time: frameTime(fr),
    blobs: candidateBlobs(fr, bg, thresholdLevel, minBlobPixels, opts.roi),
  }));

  // One point per frame: the largest moving blob. We deliberately do NOT fit a
  // global line and re-pick nearest it — when the puck sits at rest before the
  // shot, that stationary cluster dominates the fit and the moving puck gets
  // rejected as an outlier. The estimator instead reads speed from the fastest
  // frame-to-frame step, which ignores the resting cluster.
  const points = [];
  for (const pf of perFrame) {
    if (!pf.blobs.length) continue;
    const b = pf.blobs.reduce((m, x) => (x.count > m.count ? x : m));
    points.push(toPoint(pf.time, b));
  }

  points.sort((a, b) => a.t - b.t);
  return { points, frameCount: frames.length };
}
