export function rmsEnergy(samples) {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / samples.length);
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
