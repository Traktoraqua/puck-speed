import { describe, it, expect } from 'vitest';
import { measureDarkBlob } from '../src/calibration/puckDetect.js';

// Build a bright frame (white sheet) with a dark rectangle (the puck).
function frameWithDarkRect(w, h, x0, y0, x1, y1, bg = 220, fg = 30) {
  const gray = new Uint8Array(w * h).fill(bg);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) gray[y * w + x] = fg;
  return gray;
}

describe('measureDarkBlob', () => {
  it('measures the width/height of the dark region from a tap inside it', () => {
    const w = 40, h = 20;
    const gray = frameWithDarkRect(w, h, 10, 6, 25, 12); // 16 wide, 7 tall
    const box = measureDarkBlob(gray, w, h, 17, 9); // tap inside the puck
    expect(box.widthPx).toBe(16);
    expect(box.heightPx).toBe(7);
    expect(box.minX).toBe(10);
    expect(box.maxX).toBe(25);
  });

  it('returns null when the tap lands on the bright sheet', () => {
    const w = 40, h = 20;
    const gray = frameWithDarkRect(w, h, 10, 6, 25, 12);
    expect(measureDarkBlob(gray, w, h, 2, 2)).toBeNull();
  });

  it('returns null for an out-of-bounds tap', () => {
    const gray = new Uint8Array(40 * 20).fill(220);
    expect(measureDarkBlob(gray, 40, 20, -1, 5)).toBeNull();
    expect(measureDarkBlob(gray, 40, 20, 40, 5)).toBeNull();
  });
});
