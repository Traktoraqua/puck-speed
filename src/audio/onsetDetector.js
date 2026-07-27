export function rmsEnergy(samples) {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / samples.length);
}

// Sensitivity slider (1 = least sensitive .. 9 = most) → detector thresholds.
// Higher sensitivity lowers both the absolute floor and the rise ratio a shot
// must clear above the adaptive noise baseline. Values are tunable on-device.
export function sensitivityToParams(sensitivity) {
  const s = Math.min(9, Math.max(1, Math.round(sensitivity) || 5));
  return {
    riseFactor: 6.5 - 0.5 * s, // s1=6.0, s5=4.0, s9=2.0
    floor: 0.035 - 0.003 * s,  // s1=0.032, s5=0.020, s9=0.008
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
