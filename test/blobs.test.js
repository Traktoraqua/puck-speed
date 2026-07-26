import { describe, it, expect } from 'vitest';
import { connectedComponents } from '../src/detection/blobs.js';

function blank(w, h) {
  return { mask: new Uint8Array(w * h), w, h };
}
function fillRect(mask, w, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * w + x] = 1;
}

describe('connectedComponents', () => {
  it('finds one blob with correct centroid', () => {
    const { mask, w, h } = blank(10, 10);
    fillRect(mask, w, 2, 2, 4, 4); // 3x3 centred at (3,3)
    const blobs = connectedComponents(mask, w, h, 1);
    expect(blobs.length).toBe(1);
    expect(blobs[0].count).toBe(9);
    expect(blobs[0].cx).toBeCloseTo(3, 6);
    expect(blobs[0].cy).toBeCloseTo(3, 6);
  });
  it('separates two disjoint blobs and honours minPixels', () => {
    const { mask, w, h } = blank(12, 6);
    fillRect(mask, w, 0, 0, 2, 2); // 9 px
    fillRect(mask, w, 8, 4, 8, 4); // 1 px
    expect(connectedComponents(mask, w, h, 1).length).toBe(2);
    expect(connectedComponents(mask, w, h, 5).length).toBe(1);
  });
  it('gives a longer major axis for an elongated (streaked) blob', () => {
    const { mask, w, h } = blank(20, 6);
    fillRect(mask, w, 1, 3, 15, 3); // horizontal streak
    const [b] = connectedComponents(mask, w, h, 1);
    expect(b.majorLength).toBeGreaterThan(10);
    expect(Math.abs(Math.sin(b.angle))).toBeLessThan(0.2); // nearly horizontal
  });
});
