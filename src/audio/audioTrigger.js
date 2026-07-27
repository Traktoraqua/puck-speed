import { OnsetDetector } from './onsetDetector.js';

export async function startAudioTrigger(stream, onTrigger, opts = {}) {
  const { onLevel, levelIntervalMs = 33, ...detectorOpts } = opts;
  const context = new AudioContext();
  // BASE_URL-relative so the worklet resolves under any deploy path (root or /puck-speed/)
  await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}onset-worklet.js`);
  const src = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'onset-processor');
  src.connect(node); // no connection to destination: we only measure, never play back

  const detector = new OnsetDetector(detectorOpts);
  let armed = true;
  let lastLevel = 0;
  node.port.onmessage = (ev) => {
    const energy = ev.data;
    const now = performance.now();
    // Feed the live meter (throttled) even while disarmed, so the level bar
    // keeps moving during the post-shot analysis window.
    if (onLevel && now - lastLevel >= levelIntervalMs) {
      lastLevel = now;
      onLevel(energy, detector.threshold());
    }
    if (!armed) return;
    if (detector.process(energy, now)) onTrigger(now);
  };

  return {
    context,
    arm() { armed = true; },
    disarm() { armed = false; },
    setSensitivity(params) { detector.setSensitivity(params); },
  };
}
