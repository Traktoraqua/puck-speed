import { mpsToKmh } from '../math/units.js';

// Above this we treat the reading as a detection artifact, not a real shot.
const MAX_PLAUSIBLE_KMH = 250;

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

  if (pts.length >= 2) {
    // Speed = the fastest frame-to-frame step. This reads the puck's crossing
    // and ignores any stationary cluster (the puck resting before the shot),
    // which a global line fit would otherwise average down toward zero.
    let bestPx = 0;
    let bestDt = 0;
    for (let i = 1; i < pts.length; i++) {
      const dt = pts[i].t - pts[i - 1].t;
      if (dt <= 0) continue;
      const distPx = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (bestDt === 0 || distPx / dt > bestPx / bestDt) {
        bestPx = distPx;
        bestDt = dt;
      }
    }
    if (bestDt === 0) return none(pts.length);
    const mps = (bestPx / pxPerMeter) / bestDt;
    if (mpsToKmh(mps) > MAX_PLAUSIBLE_KMH) return none(pts.length);
    const method = pts.length >= 3 ? 'multiframe' : 'streak2';
    const confidence = pts.length >= 3 ? 'high' : 'medium';
    return result(mps, method, confidence, pts.length);
  }
  if (pts.length === 1 && opts.exposureTime > 0) {
    const mps = (pts[0].streakLength / pxPerMeter) / opts.exposureTime;
    return result(mps, 'streak1', 'low', 1);
  }
  return none(pts.length);
}
