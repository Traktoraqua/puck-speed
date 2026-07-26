import { describe, it, expect } from 'vitest';
import { rmsEnergy, OnsetDetector } from '../src/audio/onsetDetector.js';

describe('onset detection', () => {
  it('computes RMS energy', () => {
    expect(rmsEnergy([3, 4])).toBeCloseTo(Math.sqrt((9 + 16) / 2), 6);
  });

  it('fires once on a transient and respects the refractory window', () => {
    const d = new OnsetDetector({ refractoryMs: 200, riseFactor: 3, floor: 0.02, alpha: 0.05 });
    const fired = [];
    // quiet baseline
    for (let t = 0; t < 300; t += 20) fired.push(d.process(0.03, t));
    // loud crack at t=300
    fired.push(d.process(0.8, 300));
    // second crack inside refractory (t=350) -> ignored
    fired.push(d.process(0.8, 350));
    // crack after refractory (t=600) -> fires
    fired.push(d.process(0.8, 600));
    expect(fired.filter(Boolean).length).toBe(2);
  });
});
