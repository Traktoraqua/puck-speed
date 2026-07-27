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
  it('zooms onto the left third for → Right shots (puck launches from the left)', () => {
    const ui = mount();
    ui.zoomToSide('right');
    expect(ui.isCalibrating()).toBe(true);
    expect(document.querySelector('#frame').style.width).toBe('300%');
    // Crosshair recentres into the visible (left) third of the full frame.
    expect(ui.getCrosshairFraction().fx).toBeCloseTo(1 / 6, 6);
  });
  it('zooms onto the right third for ← Left shots (puck launches from the right)', () => {
    const ui = mount();
    ui.zoomToSide('left');
    expect(ui.getCrosshairFraction().fx).toBeCloseTo(5 / 6, 6);
  });
  it('maps a drag within the window into the visible third', () => {
    const ui = mount();
    ui.zoomToSide('left'); // base 2/3, scale 1/3
    // Simulate the drag mapping directly: a pointer 25% across the window.
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

describe('UI sound meter + sensitivity', () => {
  it('positions the fill and gate as a fraction of full scale', () => {
    const ui = mount();
    ui.setMeter(0.25, 0.05); // METER_MAX is 1.0 (peak) → 25% fill, 5% gate
    expect(document.querySelector('#fill').style.width).toBe('25%');
    expect(document.querySelector('#gate').style.left).toBe('5%');
  });
  it('clamps an over-scale level to 100% fill', () => {
    const ui = mount();
    ui.setMeter(1.5, 0.05);
    expect(document.querySelector('#fill').style.width).toBe('100%');
  });
  it('labels the sensitivity value and routes slider input', () => {
    const ui = mount();
    ui.setSensLabel(9);
    expect(document.querySelector('#sensVal').textContent).toBe('Very high');
    let got = 0;
    ui.onSensInput((v) => { got = v; });
    const slider = document.querySelector('#sens');
    slider.value = '3';
    slider.dispatchEvent(new Event('input'));
    expect(got).toBe(3);
  });
});
