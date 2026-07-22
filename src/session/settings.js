// Persisted user preferences: shot direction and display unit.
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
}
