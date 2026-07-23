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
