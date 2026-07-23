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

  it('rejects blobs far taller than the calibrated puck height', () => {
    const W = 200, H = 80;
    const roiBase = { centerY: 40, halfHeight: 35, dir: 'right', boundX: 10 };
    const bigFrames = [];
    for (let i = 0; i < 6; i++) bigFrames.push(makeFrame(i / 60, W, H, { cx: 40 + i * 10, cy: 40, r: 15 })); // ~31 px tall
    // With a puck ~9 px tall, a 31 px blob is > 2.5x -> rejected -> no track.
    const gated = detect(bigFrames, { thresholdLevel: 25, minBlobPixels: 3, roi: { ...roiBase, puckHeightPx: 9 } });
    expect(gated.points.length).toBe(0);
    // Same blob with no puckHeightPx (uncalibrated) is still tracked.
    const ungated = detect(bigFrames, { thresholdLevel: 25, minBlobPixels: 3, roi: { ...roiBase, maxHeight: 100 } });
    expect(ungated.points.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps a puck-height streak within the size band', () => {
    const W = 200, H = 80;
    const roi = { centerY: 40, halfHeight: 35, dir: 'right', boundX: 10, puckHeightPx: 9 };
    const frames = [];
    for (let i = 0; i < 6; i++) frames.push(makeFrame(i / 60, W, H, { cx: 40 + i * 10, cy: 40, r: 4 })); // ~9 px tall
    const track = detect(frames, { thresholdLevel: 25, minBlobPixels: 3, roi });
    expect(track.points.length).toBeGreaterThanOrEqual(4);
  });
});
