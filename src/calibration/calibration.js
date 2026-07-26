const KEY = 'puck.calibration';

export class Calibration {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }
  setFromPoints(p1, p2, meters, method = 'known-length') {
    if (meters <= 0) throw new Error('meters must be > 0');
    const pixels = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (pixels <= 0) throw new Error('the two points must differ');
    const value = { pxPerMeter: pixels / meters, method };
    this.storage.setItem(KEY, JSON.stringify(value));
    return value;
  }
  get() {
    const raw = this.storage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  }
  clear() {
    this.storage.removeItem(KEY);
  }
}
