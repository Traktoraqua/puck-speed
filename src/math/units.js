// src/math/units.js
export function mpsToKmh(mps) {
  return mps * 3.6;
}

export function pxPerMeter(pixels, meters) {
  if (meters <= 0) throw new Error('meters must be > 0');
  return pixels / meters;
}
