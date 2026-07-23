import { linearSlope } from '../math/linefit.js';
import { mpsToKmh } from '../math/units.js';

// Bounds and tolerances for isolating the puck's crossing from noise.
const MAX_PLAUSIBLE_KMH = 250; // above this it's a detection artifact, not a shot
const MIN_MOVING_KMH = 5;      // below this the "line" is a stationary cluster
const INLIER_TOL_PX = 20;      // how close a detection must sit to a line to count

function result(mps, method, confidence, frameCount) {
  return { speedMps: mps, speedKmh: mpsToKmh(mps), method, confidence, frameCount };
}
function none(frameCount) {
  return { speedMps: 0, speedKmh: 0, method: 'none', confidence: 'none', frameCount };
}

function refitVelocity(pts) {
  const ts = pts.map((p) => p.t);
  return { vx: linearSlope(ts, pts.map((p) => p.x)), vy: linearSlope(ts, pts.map((p) => p.y)) };
}

export function estimate(track, scale, opts = {}) {
  const pxPerMeter = scale && scale.pxPerMeter;
  if (!pxPerMeter || pxPerMeter <= 0) throw new Error('calibration scale (pxPerMeter) required');
  const pts = (track && track.points) || [];
  const minMovingKmh = opts.minMovingKmh ?? MIN_MOVING_KMH;

  if (pts.length >= 2) {
    // RANSAC: try every pair as a constant-velocity hypothesis; keep the moving,
    // plausible-speed line that the most detections agree with. This isolates the
    // puck's crossing from the stationary cluster of blobs left at its launch spot.
    let best = null;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dt = pts[j].t - pts[i].t;
        if (dt <= 0) continue;
        const vx = (pts[j].x - pts[i].x) / dt;
        const vy = (pts[j].y - pts[i].y) / dt;
        const kmh = mpsToKmh(Math.hypot(vx, vy) / pxPerMeter);
        if (kmh < minMovingKmh || kmh > MAX_PLAUSIBLE_KMH) continue;
        const inliers = [];
        for (const p of pts) {
          const d = p.t - pts[i].t;
          if (Math.hypot(p.x - (pts[i].x + vx * d), p.y - (pts[i].y + vy * d)) <= INLIER_TOL_PX) {
            inliers.push(p);
          }
        }
        if (!best || inliers.length > best.inliers.length) best = { inliers };
      }
    }
    if (best && best.inliers.length >= 2) {
      const { vx, vy } = refitVelocity(best.inliers); // least-squares over the inliers
      const mps = Math.hypot(vx, vy) / pxPerMeter;
      if (mpsToKmh(mps) > MAX_PLAUSIBLE_KMH) return none(pts.length);
      const n = best.inliers.length;
      const method = n >= 3 ? 'multiframe' : 'streak2';
      const confidence = n >= 4 ? 'high' : 'medium';
      return result(mps, method, confidence, pts.length);
    }
    return none(pts.length);
  }
  if (pts.length === 1 && opts.exposureTime > 0) {
    const mps = (pts[0].streakLength / pxPerMeter) / opts.exposureTime;
    return result(mps, 'streak1', 'low', 1);
  }
  return none(pts.length);
}
