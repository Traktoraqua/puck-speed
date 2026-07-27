// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Settings } from '../src/session/settings.js';

beforeEach(() => localStorage.clear());

describe('Settings', () => {
  it('defaults to right / km/h', () => {
    const s = new Settings();
    expect(s.getDirection()).toBe('right');
    expect(s.getUnit()).toBe('kmh');
  });
  it('persists direction and unit independently', () => {
    new Settings().setDirection('left');
    new Settings().setUnit('mph');
    const s = new Settings();
    expect(s.getDirection()).toBe('left');
    expect(s.getUnit()).toBe('mph');
  });
  it('rejects unknown values back to defaults', () => {
    const s = new Settings();
    expect(s.setDirection('sideways')).toBe('right');
    expect(s.setUnit('furlongs')).toBe('kmh');
  });
  it('defaults min speed to 20 km/h', () => {
    expect(new Settings().getMinSpeed()).toBe(20);
  });
  it('clamps and snaps min speed to 5..40 in steps of 5', () => {
    const s = new Settings();
    expect(s.setMinSpeed(3)).toBe(5);     // clamp low
    expect(s.setMinSpeed(100)).toBe(40);  // clamp high
    expect(s.setMinSpeed(17)).toBe(15);   // snap to nearest 5
    expect(new Settings().getMinSpeed()).toBe(15); // persisted
  });
  it('defaults sensitivity to 5 and clamps/persists 1..9', () => {
    const s = new Settings();
    expect(s.getSensitivity()).toBe(5);
    expect(s.setSensitivity(0)).toBe(1);   // clamp low
    expect(s.setSensitivity(12)).toBe(9);  // clamp high
    expect(s.setSensitivity(7)).toBe(7);
    expect(new Settings().getSensitivity()).toBe(7); // persisted
  });
});
