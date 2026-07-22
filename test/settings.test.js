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
});
