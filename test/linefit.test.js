import { describe, it, expect } from 'vitest';
import { linearSlope, fitTrajectory, predictAt } from '../src/math/linefit.js';

describe('linefit', () => {
  it('finds the slope of a line', () => {
    expect(linearSlope([0, 1, 2, 3], [1, 3, 5, 7])).toBeCloseTo(2, 6);
  });
  it('returns 0 for a single point (degenerate)', () => {
    expect(linearSlope([5], [9])).toBe(0);
  });
  it('fits a constant-velocity trajectory', () => {
    const pts = [
      { t: 0, x: 0, y: 10 },
      { t: 1, x: 4, y: 10 },
      { t: 2, x: 8, y: 10 },
    ];
    const fit = fitTrajectory(pts);
    expect(fit.vx).toBeCloseTo(4, 6);
    expect(fit.vy).toBeCloseTo(0, 6);
    expect(predictAt(fit, 3)).toEqual([expect.closeTo(12, 6), expect.closeTo(10, 6)]);
  });
});
