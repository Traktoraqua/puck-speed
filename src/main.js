import { startCapture } from './capture/capture.js';
import { startAudioTrigger } from './audio/audioTrigger.js';
import { detect } from './detection/detect.js';
import { estimate } from './speed/estimator.js';
import { Calibration } from './calibration/calibration.js';
import { History } from './session/history.js';
import { UI } from './ui/ui.js';
import { cssToDetection } from './ui/coords.js';

export function appName() {
  return 'puck-speed';
}

export function freezeWindow(triggerMs, preMs = 100, postMs = 400) {
  return [triggerMs - preMs, triggerMs + postMs];
}

export async function boot() {
  const ui = new UI();
  const calibration = new Calibration();
  const history = new History();
  history && ui.renderHistory(history.list());

  let capture;
  try {
    capture = await startCapture({
      onSettings: (s) => {
        const fps = s.frameRate || 0;
        ui.setFpsBadge(fps);
        if (fps && fps < 50) ui.showWarning(`Only ${Math.round(fps)} fps granted — fast shots may be low-confidence.`);
      },
    });
  } catch (err) {
    ui.showWarning('Camera/mic permission is required.');
    return;
  }
  ui.renderPreview(capture.video);

  ui.onCalibrateClick(async () => {
    ui.showWarning('Tap the two edges of the puck (76.2 mm).');
    const { pts, rect } = await ui.collectTwoTaps();
    const p1 = cssToDetection(pts[0], rect, capture.detectWidth, capture.detectHeight);
    const p2 = cssToDetection(pts[1], rect, capture.detectWidth, capture.detectHeight);
    try {
      calibration.setFromPoints(p1, p2, 0.0762, 'puck-diameter');
      ui.showWarning('');
    } catch (err) {
      ui.showWarning(`Calibration failed: ${err.message}`);
    }
  });

  const trigger = await startAudioTrigger(capture.stream, (triggerMs) => {
    const scale = calibration.get();
    if (!scale) {
      ui.showWarning('Set calibration before measuring.');
      return;
    }
    trigger.disarm();
    const [t0, t1] = freezeWindow(triggerMs);
    // wait for the post-roll frames to arrive, then analyse
    setTimeout(() => {
      const frames = capture.ring.snapshot(t0, t1);
      let result;
      try {
        result = estimate(detect(frames), scale, { exposureTime: capture.settings.exposureTime });
      } catch (err) {
        ui.showWarning(err.message);
        trigger.arm();
        return;
      }
      ui.showResult(result);
      if (result.method !== 'none') ui.renderHistory(history.add(result.speedKmh));
      trigger.arm();
    }, 450);
  });

  // Resume the autoplay-suspended AudioContext on the first user gesture anywhere.
  // Registered after `trigger` exists (no TDZ), and covers both the calibrate tap
  // and a returning user with saved calibration who only taps to begin shooting —
  // without it, a suspended context means the shot trigger silently never fires.
  document.addEventListener('pointerdown', () => {
    if (trigger.context.state === 'suspended') trigger.context.resume();
  }, { once: true });
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  boot();
}
