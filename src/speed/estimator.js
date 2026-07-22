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
