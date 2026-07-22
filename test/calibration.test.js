// @vitest-environment jsdom
// test/calibration.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { Calibration } from '../src/calibration/calibration.js';
import { History } from '../src/session/history.js';

beforeEach(() => localStorage.clear());

describe('Calibration', () => {
  it('derives px/m from two points and a real length', () => {
    const c = new Calibration();
    const v = c.setFromPoints({ x: 0, y: 0 }, { x: 300, y: 0 }, 1.5, 'known-length');
    expect(v.pxPerMeter).toBeCloseTo(200, 6);
    expect(c.get().method).toBe('known-length');
  });
  it('supports the puck-edge (0.0762 m) method via the same call', () => {
    const c = new Calibration();
    const v = c.setFromPoints({ x: 100, y: 50 }, { x: 138.1, y: 50 }, 0.0762, 'puck-diameter');
    expect(v.pxPerMeter).toBeCloseTo(38.1 / 0.0762, 3);
  });
  it('rejects bad input', () => {
    const c = new Calibration();
    expect(() => c.setFromPoints({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toThrow(/meters/);
    expect(() => c.setFromPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 1)).toThrow(/points/);
  });
});

describe('History', () => {
  it('keeps only the last 3 shots, newest first', () => {
    const h = new History(localStorage, 3);
    h.add(90.11); h.add(100.04); h.add(80.5); h.add(120.9);
    expect(h.list()).toEqual([120.9, 80.5, 100]);
  });
});
