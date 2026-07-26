// Text-to-speech for shot readouts. Uses the Web Speech API when available and
// is a no-op everywhere it isn't (jsdom in tests, older WebViews).

function synth() {
  return typeof globalThis !== 'undefined' ? globalThis.speechSynthesis : undefined;
}

// iOS Safari only allows speechSynthesis to speak after a real user gesture. Call
// this from a tap handler (e.g. "Tap to start") to unlock it with a silent
// utterance, so later shot-triggered announcements aren't blocked.
export function primeSpeech() {
  const s = synth();
  if (!s || typeof globalThis.SpeechSynthesisUtterance !== 'function') return false;
  s.speak(new globalThis.SpeechSynthesisUtterance(''));
  return true;
}

export function speak(text) {
  const s = synth();
  if (!s || typeof globalThis.SpeechSynthesisUtterance !== 'function') return false;
  s.cancel(); // drop any queued/earlier readout so the newest shot wins
  const u = new globalThis.SpeechSynthesisUtterance(String(text));
  s.speak(u);
  return true;
}
