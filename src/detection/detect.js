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
