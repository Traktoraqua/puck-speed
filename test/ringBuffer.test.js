import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../src/capture/ringBuffer.js';

describe('RingBuffer', () => {
  it('evicts frames older than the window', () => {
    const rb = new RingBuffer(100); // 100 ms window
    rb.push({ t: 0 });
    rb.push({ t: 50 });
    rb.push({ t: 160 }); // cutoff = 60 -> drops t=0 and t=50
    expect(rb.size).toBe(1);
  });
  it('returns a time-bounded, sorted snapshot', () => {
    const rb = new RingBuffer(1000);
    rb.push({ t: 30 });
    rb.push({ t: 10 });
    rb.push({ t: 20 });
    expect(rb.snapshot(10, 20).map((f) => f.t)).toEqual([10, 20]);
  });
});
