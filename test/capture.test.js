import { describe, it, expect } from 'vitest';
import { toGray } from '../src/capture/capture.js';

describe('toGray', () => {
  it('converts RGBA to luma', () => {
    // one white pixel, one black pixel
    const data = Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255]);
    const gray = toGray({ data, width: 2, height: 1 });
    expect(gray[0]).toBe(255);
    expect(gray[1]).toBe(0);
  });
});
