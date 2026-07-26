// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { UI } from '../src/ui/ui.js';

function mount() {
  document.body.innerHTML = '<div id="app"></div>';
  return new UI();
}

describe('UI min-speed stepper', () => {
  it('renders the stepper and updates its label', () => {
    const ui = mount();
    ui.setMinSpeedLabel(20);
    expect(document.querySelector('#minSpeedBtn').textContent).toBe('Min 20 km/h');
    ui.setMinSpeedLabel(35);
    expect(document.querySelector('#minSpeedBtn').textContent).toBe('Min 35 km/h');
  });
  it('routes − and + clicks to their handlers', () => {
    const ui = mount();
    let down = 0, up = 0;
    ui.onMinSpeedClick('down', () => down++);
    ui.onMinSpeedClick('up', () => up++);
    document.querySelector('#minDownBtn').click();
    document.querySelector('#minUpBtn').click();
    expect([down, up]).toEqual([1, 1]);
  });
});

describe('UI has no last-3 history', () => {
  it('renders no history strip and exposes no renderHistory', () => {
    const ui = mount();
    expect(document.querySelector('#history')).toBeNull();
    expect(document.querySelector('.history')).toBeNull();
    expect(ui.renderHistory).toBeUndefined();
  });
});

describe('UI calibration zoom', () => {
  it('zooms onto the right third for → Right shots', () => {
    const ui = mount();
    ui.zoomToSide('right');
    expect(ui.isCalibrating()).toBe(true);
    expect(document.querySelector('#frame').style.width).toBe('300%');
    // Crosshair recentres into the visible (right) third of the full frame.
    expect(ui.getCrosshairFraction().fx).toBeCloseTo(5 / 6, 6);
  });
  it('zooms onto the left third for ← Left shots', () => {
    const ui = mount();
    ui.zoomToSide('left');
    expect(ui.getCrosshairFraction().fx).toBeCloseTo(1 / 6, 6);
  });
  it('maps a drag within the window into the visible third', () => {
    const ui = mount();
    ui.zoomToSide('right'); // base 2/3, scale 1/3
    // Simulate the drag mapping directly: a pointer 25% across the window.
    ui.zoomBase = 2 / 3; ui.zoomScale = 1 / 3;
    ui.crossFx = ui.zoomBase + 0.25 * ui.zoomScale;
    expect(ui.crossFx).toBeCloseTo(2 / 3 + 1 / 12, 6);
  });
  it('hidePreview hides the whole preview and ends calibration', () => {
    const ui = mount();
    ui.zoomToSide('right');
    ui.hidePreview();
    expect(ui.isCalibrating()).toBe(false);
    expect(document.querySelector('.preview').hidden).toBe(true);
  });
});
