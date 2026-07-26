// Persisted user preferences: shot direction, display unit, and min-speed floor.
const KEY = 'puck.settings';

export class Settings {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }
  _all() {
    const raw = this.storage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  }
  _set(patch) {
    const next = { ...this._all(), ...patch };
    this.storage.setItem(KEY, JSON.stringify(next));
    return next;
  }
  getDirection() {
    return this._all().direction === 'left' ? 'left' : 'right';
  }
  setDirection(direction) {
    this._set({ direction: direction === 'left' ? 'left' : 'right' });
    return this.getDirection();
  }
  getUnit() {
    return this._all().unit === 'mph' ? 'mph' : 'kmh';
  }
  setUnit(unit) {
    this._set({ unit: unit === 'mph' ? 'mph' : 'kmh' });
    return this.getUnit();
  }
  getMinSpeed() {
    const v = this._all().minSpeedKmh;
    return Number.isFinite(v) && v >= 5 && v <= 40 && v % 5 === 0 ? v : 20;
  }
  setMinSpeed(kmh) {
    let v = Math.round(Number(kmh) / 5) * 5;
    if (!Number.isFinite(v)) v = 20;
    v = Math.min(40, Math.max(5, v));
    this._set({ minSpeedKmh: v });
    return this.getMinSpeed();
  }
}
