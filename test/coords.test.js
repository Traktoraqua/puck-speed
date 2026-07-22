import { describe, it, expect } from 'vitest';
import { cssToDetection } from '../src/ui/coords.js';

describe('cssToDetection', () => {
  it('maps a screen tap into detection-pixel space', () => {
    const rect = { left: 0, top: 0, width: 360, height: 200 };
    // detection frame is 480x267; tap at centre of the element
    const p = cssToDetection({ x: 180, y: 100 }, rect, 480, 267);
    expect(p.x).toBeCloseTo(240, 3);
    expect(p.y).toBeCloseTo(133.5, 3);
  });
  it('maps the top-left corner to (0,0)', () => {
    const rect = { left: 20, top: 40, width: 360, height: 200 };
    const p = cssToDetection({ x: 20, y: 40 }, rect, 480, 267);
    expect(p).toEqual({ x: 0, y: 0 });
  });
});
