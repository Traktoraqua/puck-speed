import { describe, it, expect } from 'vitest';
import { rmsEnergy, OnsetDetector, sensitivityToParams } from '../src/audio/onsetDetector.js';

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

  it('maps higher sensitivity to lower thresholds, clamped to 1..9', () => {
    const low = sensitivityToParams(1);
    const mid = sensitivityToParams(5);
    const high = sensitivityToParams(9);
    expect(low.riseFactor).toBeGreaterThan(high.riseFactor);
    expect(low.floor).toBeGreaterThan(high.floor);
    expect(mid.floor).toBeCloseTo(0.02, 6);
    // out-of-range and junk clamp to the ends / default
    expect(sensitivityToParams(99)).toEqual(high);
    expect(sensitivityToParams(-4)).toEqual(low);
    expect(sensitivityToParams(NaN)).toEqual(mid);
  });

  it('exposes a live threshold that setSensitivity retunes', () => {
    const d = new OnsetDetector({ riseFactor: 3, floor: 0.02 });
    expect(d.threshold()).toBeCloseTo(0.02, 6); // baseline 0 → floor dominates
    for (let t = 0; t < 200; t += 20) d.process(0.05, t); // raise the baseline
    expect(d.threshold()).toBeGreaterThan(0.02);
    d.setSensitivity({ riseFactor: 2, floor: 0.008 });
    expect(d.riseFactor).toBe(2);
    expect(d.floor).toBe(0.008);
  });
});
