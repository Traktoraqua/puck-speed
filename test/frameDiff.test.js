import { describe, it, expect } from 'vitest';
import { absDiff, threshold } from '../src/detection/frameDiff.js';

describe('frameDiff', () => {
  it('computes absolute per-pixel difference', () => {
    const d = absDiff(Uint8Array.from([10, 200]), Uint8Array.from([12, 190]));
    expect(Array.from(d)).toEqual([2, 10]);
  });
  it('thresholds to a binary mask', () => {
    const m = threshold(Uint8Array.from([2, 10, 40]), 10);
    expect(Array.from(m)).toEqual([0, 1, 1]);
  });
});
