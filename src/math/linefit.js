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
