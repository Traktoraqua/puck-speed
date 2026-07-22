import { describe, it, expect } from 'vitest';
import { makeFrame, medianBackground, detect } from '../src/detection/detect.js';

describe('detection pipeline', () => {
  it('builds a background where the moving puck is removed', () => {
    // puck present in only 1 of 5 frames -> median is background (value 20)
    const W = 40, H = 20;
    const frames = [];
    for (let i = 0; i < 5; i++) {
      const disc = i === 2 ? { cx: 20, cy: 10, r: 3 } : null;
      frames.push(makeFrame(i / 60, W, H, disc));
    }
    const bg = medianBackground(frames);
    expect(bg.gray[10 * W + 20]).toBe(20);
  });

  it('recovers a constant-velocity track across frames', () => {
    const W = 200, H = 40, r = 4;
    const frames = [];
    // puck moves 10 px/frame in x, 60 fps
    for (let i = 0; i < 6; i++) {
      frames.push(makeFrame(i / 60, W, H, { cx: 30 + i * 10, cy: 20, r }));
    }
    const track = detect(frames, { thresholdLevel: 25, minBlobPixels: 3 });
    expect(track.points.length).toBeGreaterThanOrEqual(4);
    // centroid should advance ~10 px per frame
    const xs = track.points.map((p) => p.x);
    expect(xs[xs.length - 1] - xs[0]).toBeGreaterThan(30);
  });
});
