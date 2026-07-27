import './ui/styles.css';
import { startCapture } from './capture/capture.js';
import { startAudioTrigger } from './audio/audioTrigger.js';
import { detect } from './detection/detect.js';
import { estimate } from './speed/estimator.js';
import { Calibration } from './calibration/calibration.js';
import { measureDarkBlob } from './calibration/puckDetect.js';
import { Settings } from './session/settings.js';
import { UI } from './ui/ui.js';
import { speak, primeSpeech } from './audio/speak.js';
import { sensitivityToParams } from './audio/onsetDetector.js';

export function appName() {
  return 'puck-speed';
}

export function freezeWindow(triggerMs, preMs = 100, postMs = 400) {
  return [triggerMs - preMs, triggerMs + postMs];
}

export async function boot() {
  const ui = new UI();
  const calibration = new Calibration();
  const settings = new Settings();

  ui.setUnitLabel(settings.getUnit());
  ui.setDirLabel(settings.getDirection());
  ui.setMinSpeedLabel(settings.getMinSpeed());
  ui.setSensSlider(settings.getSensitivity());
  ui.setSensLabel(settings.getSensitivity());

  // Holds the live audio trigger once the mic starts, so the sensitivity slider
  // can retune detection while listening.
  let audioTrigger = null;
  ui.onSensInput((s) => {
    const v = settings.setSensitivity(s);
    ui.setSensLabel(v);
    if (audioTrigger) audioTrigger.setSensitivity(sensitivityToParams(v));
  });

  // Unit and direction toggles (persisted; usable before the camera starts).
  ui.onUnitClick(() => {
    ui.setUnitLabel(settings.setUnit(settings.getUnit() === 'kmh' ? 'mph' : 'kmh'));
  });
  ui.onDirClick(() => {
    const dir = settings.setDirection(settings.getDirection() === 'right' ? 'left' : 'right');
    ui.setDirLabel(dir);
    // While calibrating, follow the shot side so the zoomed third matches.
    if (ui.isCalibrating()) ui.zoomToSide(dir);
  });
  const stepMinSpeed = (delta) => ui.setMinSpeedLabel(settings.setMinSpeed(settings.getMinSpeed() + delta));
  ui.onMinSpeedClick('down', () => stepMinSpeed(-5));
  ui.onMinSpeedClick('up', () => stepMinSpeed(5));

  // iOS/WebKit rejects getUserMedia unless it's invoked from a user gesture, so
  // the whole camera+mic pipeline starts on the "Tap to start" tap, not on load.
  ui.onStart(async () => {
    // This tap is a user gesture — unlock iOS speech now so shot readouts work later.
    primeSpeech();
    ui.showWarning('Starting camera…');
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
      const detail = !navigator.mediaDevices
        ? 'navigator.mediaDevices is undefined (insecure context — needs trusted HTTPS)'
        : `${err.name}: ${err.message}`;
      ui.showWarning(`Camera/mic unavailable — ${detail} (tap to retry)`);
      return; // start button stays, so the user can tap again
    }
    ui.showWarning('');
    ui.dismissStart();
    ui.renderPreview(capture.canvas); // the cropped horizontal band
    wireAfterStart(ui, calibration, capture, settings, (t) => { audioTrigger = t; });
  });
}

// Wires calibration + the shot trigger once the camera stream exists.
async function wireAfterStart(ui, calibration, capture, settings, setTrigger) {
  // Draggable crosshair: position it over the black puck, then press Calibrate.
  ui.enableCrosshair();
  ui.zoomToSide(settings.getDirection()); // magnify onto the puck's resting third
  ui.showWarning('Drag the crosshair onto the puck, then press Calibrate.');

  // Puck geometry from calibration, used to focus shot detection on the puck's
  // travel line and reject bigger/off-line blobs (shooter, stick, sheet).
  let puckGeom = null;

  ui.onResetClick(() => {
    calibration.clear();
    puckGeom = null;
    ui.clearOverlay();
    ui.zoomToSide(settings.getDirection()); // bring the (hidden) preview back to re-calibrate
    ui.showWarning('Calibration reset — drag the crosshair onto the puck and press Calibrate.');
  });

  // Calibrate from the puck under the crosshair: flood-fill the dark region and
  // use its on-screen width as the known 76.2 mm diameter → pixels-per-metre.
  ui.onCalibrateClick(() => {
    const { fx, fy } = ui.getCrosshairFraction();
    const frame = capture.ring.frames.at(-1);
    if (!frame) {
      ui.showWarning('No camera frame yet — try again.');
      return;
    }
    const tx = Math.round(fx * frame.width);
    const ty = Math.round(fy * frame.height);
    const box = measureDarkBlob(frame.gray, frame.width, frame.height, tx, ty);
    if (!box || box.widthPx < 4) {
      ui.showWarning('Crosshair is not on the puck — drag it onto the black puck and press Calibrate.');
      return;
    }
    const cy = Math.round((box.minY + box.maxY) / 2);
    try {
      const { pxPerMeter } = calibration.setFromPoints(
        { x: box.minX, y: cy }, { x: box.maxX, y: cy }, 0.0762, 'puck-crosshair'
      );
      // Store both edges; detection tracks downrange in the chosen shot direction.
      puckGeom = { cy, heightPx: box.heightPx, leftEdge: box.minX, rightEdge: box.maxX };
      ui.hidePreview(); // video no longer needed once calibrated
      ui.showWarning(`Calibrated: puck ${box.widthPx}px wide → ${Math.round(pxPerMeter)} px/m. Ready — take a shot.`);
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
    ui.clearOverlay();
    const [t0, t1] = freezeWindow(triggerMs);
    // wait for the post-roll frames to arrive, then analyse
    setTimeout(() => {
      const frames = capture.ring.snapshot(t0, t1);
      let result;
      try {
        const exposureTime = capture.settings.exposureTime
          ? capture.settings.exposureTime * 1e-4   // getSettings() reports 100-µs units; estimator wants seconds
          : undefined;
        // Focus detection on the puck's travel line (from calibration).
        const dir = settings.getDirection();
        const roi = puckGeom
          ? {
              centerY: puckGeom.cy,
              halfHeight: Math.max(30, puckGeom.heightPx * 6),
              puckHeightPx: puckGeom.heightPx,
              dir,
              boundX: dir === 'left' ? puckGeom.leftEdge : puckGeom.rightEdge,
            }
          : undefined;
        const track = detect(frames, { roi });
        result = estimate(track, scale, { exposureTime, minMovingKmh: settings.getMinSpeed() });
      } catch (err) {
        ui.showWarning(err.message);
        trigger.arm();
        return;
      }
      ui.showResult(result);
      if (result.method !== 'none') speak(ui.displaySpeed(result.speedKmh).value.toFixed(1));
      trigger.arm();
    }, 450);
  }, {
    ...sensitivityToParams(settings.getSensitivity()),
    onLevel: (level, threshold) => ui.setMeter(level, threshold),
  });
  setTrigger(trigger); // let the sensitivity slider retune this trigger live

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
