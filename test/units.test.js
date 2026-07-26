// test/units.test.js
import { describe, it, expect } from 'vitest';
import { mpsToKmh, pxPerMeter, kmhToMph } from '../src/math/units.js';

describe('units', () => {
  it('converts m/s to km/h', () => {
    expect(mpsToKmh(10)).toBeCloseTo(36, 6);
  });
  it('converts km/h to mph', () => {
    expect(kmhToMph(100)).toBeCloseTo(62.1371, 3);
  });
  it('computes px per meter', () => {
    expect(pxPerMeter(200, 0.5)).toBeCloseTo(400, 6);
  });
  it('rejects non-positive meters', () => {
    expect(() => pxPerMeter(200, 0)).toThrow(/meters/);
  });
});
