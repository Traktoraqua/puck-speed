import { describe, it, expect } from 'vitest';
import { estimate } from '../src/speed/estimator.js';

const scale = { pxPerMeter: 100 }; // 100 px = 1 m

describe('speed estimator', () => {
  it('multi-frame: 1000 px/s at 100 px/m -> 10 m/s -> 36 km/h', () => {
    const points = [0, 1, 2, 3].map((i) => ({ t: i * 0.1, x: i * 100, y: 5, streakLength: 8, streakAngle: 0 }));
    const r = estimate({ points, frameCount: 4 }, scale);
    expect(r.method).toBe('multiframe');
    expect(r.confidence).toBe('high');
    expect(r.speedKmh).toBeCloseTo(36, 3);
  });

  it('two-frame streak fallback', () => {
    const points = [
      { t: 0, x: 0, y: 5, streakLength: 8, streakAngle: 0 },
      { t: 0.1, x: 100, y: 5, streakLength: 8, streakAngle: 0 },
    ];
    const r = estimate({ points, frameCount: 2 }, scale);
    expect(r.method).toBe('streak2');
    expect(r.confidence).toBe('medium');
    expect(r.speedKmh).toBeCloseTo(36, 3);
  });

  it('single-frame streak needs exposure time', () => {
    const points = [{ t: 0, x: 0, y: 5, streakLength: 50, streakAngle: 0 }];
    const r = estimate({ points, frameCount: 1 }, scale, { exposureTime: 0.05 });
    // 50 px / 100 px/m = 0.5 m over 0.05 s = 10 m/s = 36 km/h
    expect(r.method).toBe('streak1');
    expect(r.speedKmh).toBeCloseTo(36, 3);
  });

  it('reports none when there is nothing usable', () => {
    expect(estimate({ points: [], frameCount: 0 }, scale).method).toBe('none');
    expect(estimate({ points: [{ t: 0, x: 0, y: 0, streakLength: 5, streakAngle: 0 }], frameCount: 1 }, scale).method).toBe('none');
  });

  it('throws without calibration', () => {
    expect(() => estimate({ points: [], frameCount: 0 }, {})).toThrow(/calibration/);
  });
});
