import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { speak, primeSpeech } from '../src/audio/speak.js';

describe('speak (Web Speech readout)', () => {
  const realSynth = globalThis.speechSynthesis;
  const realUtter = globalThis.SpeechSynthesisUtterance;

  afterEach(() => {
    globalThis.speechSynthesis = realSynth;
    globalThis.SpeechSynthesisUtterance = realUtter;
  });

  it('is a no-op (returns false) when the API is unavailable', () => {
    delete globalThis.speechSynthesis;
    delete globalThis.SpeechSynthesisUtterance;
    expect(speak('49.3')).toBe(false);
    expect(primeSpeech()).toBe(false);
  });

  it('cancels queued speech and speaks the given text in the default voice', () => {
    const spoken = [];
    globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    globalThis.speechSynthesis = {
      cancel: vi.fn(),
      speak: vi.fn((u) => spoken.push(u)),
    };
    expect(speak('50')).toBe(true);
    expect(globalThis.speechSynthesis.cancel).toHaveBeenCalledOnce();
    expect(spoken.map((u) => u.text)).toEqual(['50']);
    expect(spoken[0].lang).toBeUndefined(); // no forced language — phone default
  });

  it('primeSpeech speaks a silent utterance to unlock iOS', () => {
    globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    globalThis.speechSynthesis = { cancel: vi.fn(), speak: vi.fn() };
    expect(primeSpeech()).toBe(true);
    expect(globalThis.speechSynthesis.speak).toHaveBeenCalledOnce();
  });
});
