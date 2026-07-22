export class RingBuffer {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.frames = [];
  }
  get size() {
    return this.frames.length;
  }
  push(frame) {
    this.frames.push(frame);
    const cutoff = frame.t - this.windowMs;
    while (this.frames.length && this.frames[0].t < cutoff) this.frames.shift();
  }
  snapshot(t0, t1) {
    return this.frames
      .filter((f) => f.t >= t0 && f.t <= t1)
      .sort((a, b) => a.t - b.t);
  }
  clear() {
    this.frames = [];
  }
}
