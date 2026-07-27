export function rmsEnergy(samples) {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / samples.length);
}

// Sensitivity slider (1 = least sensitive .. 9 = most) → detector thresholds.
// Mirrors the shot-counter app's mapping so the shot trigger sits at the same
// loudness (the worklet now reports peak amplitude, as shot-counter does).
export function sensitivityToParams(sensitivity) {
  const s = Math.min(9, Math.max(1, Math.round(sensitivity) || 5));
  return {
    riseFactor: 10.5 - s,     // ratio above the adaptive noise floor: s1=9.5 .. s9=1.5
    floor: 0.32 - 0.028 * s,  // absolute peak floor: s1≈0.29 .. s9≈0.068
  };
}

export class OnsetDetector {
  constructor({ refractoryMs = 200, riseFactor = 3, floor = 0.02, alpha = 0.05 } = {}) {
    this.refractoryMs = refractoryMs;
    this.riseFactor = riseFactor;
    this.floor = floor;
    this.alpha = alpha;
    this.baseline = 0;
    this.lastTrigger = -Infinity;
    this.primed = false;
  }
  // Update the trigger thresholds live (from the sensitivity slider).
  setSensitivity({ riseFactor, floor }) {
    if (Number.isFinite(riseFactor)) this.riseFactor = riseFactor;
    if (Number.isFinite(floor)) this.floor = floor;
  }
  // The effective level a shot must exceed right now, for the meter's gate line.
  threshold() {
    return Math.max(this.floor, this.baseline * this.riseFactor);
  }
  process(energy, timeMs) {
    const isOnset =
      this.primed &&
      energy > this.floor &&
      energy > this.baseline * this.riseFactor &&
      timeMs - this.lastTrigger > this.refractoryMs;
    this.baseline = this.primed
      ? (1 - this.alpha) * this.baseline + this.alpha * energy
      : energy;
    this.primed = true;
    if (isOnset) {
      this.lastTrigger = timeMs;
      return true;
    }
    return false;
  }
}
