import { OnsetDetector } from './onsetDetector.js';

export async function startAudioTrigger(stream, onTrigger, opts = {}) {
  const context = new AudioContext();
  // BASE_URL-relative so the worklet resolves under any deploy path (root or /puck-speed/)
  await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}onset-worklet.js`);
  const src = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'onset-processor');
  src.connect(node); // no connection to destination: we only measure, never play back

  const detector = new OnsetDetector(opts);
  let armed = true;
  node.port.onmessage = (ev) => {
    if (!armed) return;
    if (detector.process(ev.data, performance.now())) onTrigger(performance.now());
  };

  return {
    context,
    arm() { armed = true; },
    disarm() { armed = false; },
  };
}
