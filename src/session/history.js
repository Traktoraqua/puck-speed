const HKEY = 'puck.history';

export class History {
  constructor(storage = globalThis.localStorage, max = 3) {
    this.storage = storage;
    this.max = max;
  }
  add(speedKmh) {
    const list = this.list();
    list.unshift(Math.round(speedKmh * 10) / 10);
    while (list.length > this.max) list.pop();
    this.storage.setItem(HKEY, JSON.stringify(list));
    return list;
  }
  list() {
    const raw = this.storage.getItem(HKEY);
    return raw ? JSON.parse(raw) : [];
  }
  clear() {
    this.storage.removeItem(HKEY);
  }
}
