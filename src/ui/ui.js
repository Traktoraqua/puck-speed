import { kmhToMph } from '../math/units.js';

export class UI {
  constructor(root = document.getElementById('app')) {
    this.root = root;
    this.root.innerHTML = `
      <header id="hdr">
        <div class="brand">PUCK<span>SPEED</span></div>
        <div class="status"><span class="dot"></span><span id="fps">Camera off</span></div>
      </header>
      <div class="stage">
        <div class="preview">
          <div class="frame" id="frame">
            <div class="overlay" id="overlay"></div>
            <div class="crosshair" id="crosshair" hidden></div>
          </div>
        </div>
        <main class="board">
          <div class="count-label">Puck speed</div>
          <div class="speed" id="speed"><small>start the camera, then calibrate on the puck</small></div>
          <div class="substats">
            <div class="substat"><div class="v" id="dirStat">→ Right</div><div class="k">Direction</div></div>
            <div class="substat"><div class="v" id="minStat">20 km/h</div><div class="k">Min speed</div></div>
          </div>
        </main>
        <div id="warn"></div>
      </div>
      <div class="controls">
        <button id="startBtn">Start camera</button>
        <div class="row">
          <button id="calBtn">Calibrate</button>
          <button id="resetBtn" class="ghost">Reset</button>
        </div>
        <div class="row">
          <button id="dirBtn">Shots: → Right</button>
          <button id="unitBtn">km/h</button>
        </div>
        <div class="minspeed">
          <button id="minDownBtn" class="step" aria-label="Decrease minimum speed">−</button>
          <b id="minSpeedBtn">Min 20 km/h</b>
          <button id="minUpBtn" class="step" aria-label="Increase minimum speed">+</button>
        </div>
      </div>
    `;
    this.$hdr = this.root.querySelector('#hdr');
    this.$speed = this.root.querySelector('#speed');
    this.$warn = this.root.querySelector('#warn');
    this.$fps = this.root.querySelector('#fps');
    this.$preview = this.root.querySelector('.preview');
    this.$frame = this.root.querySelector('#frame');
    this.$overlay = this.root.querySelector('#overlay');
    this.$crosshair = this.root.querySelector('#crosshair');
    this.$dirBtn = this.root.querySelector('#dirBtn');
    this.$dirStat = this.root.querySelector('#dirStat');
    this.$unitBtn = this.root.querySelector('#unitBtn');
    this.$minSpeed = this.root.querySelector('#minSpeedBtn');
    this.$minStat = this.root.querySelector('#minStat');
    this.crossFx = 0.5; // crosshair position as a fraction of the full detection frame
    this.crossFy = 0.5;
    // Calibration zoom: the preview window shows only a `zoomScale`-wide slice of
    // the frame starting at `zoomBase` (both fractions of the full frame width).
    this.zoomBase = 0;
    this.zoomScale = 1;
    this._zoomed = false;
    this.unit = 'kmh';
  }
  // Convert a canonical km/h value to the display unit + label.
  _fmt(kmh) {
    return this.unit === 'mph'
      ? { value: kmhToMph(kmh), label: 'mph' }
      : { value: kmh, label: 'km/h' };
  }
  renderPreview(video) {
    video.classList.add('preview-video');
    this.$frame.prepend(video);
  }
  setFpsBadge(fps) {
    this.$fps.textContent = `${Math.round(fps)} fps`;
    this.$hdr.classList.add('live'); // green status dot once the camera is running
  }
  showWarning(msg) {
    this.$warn.innerHTML = msg ? `<div class="warn">${msg}</div>` : '';
  }
  showResult(result) {
    if (result.method === 'none') {
      this.$speed.innerHTML = `<span class="confidence-none">no valid shot</span>`;
      return;
    }
    const cls = result.confidence === 'low' ? 'confidence-low' : '';
    const tag = result.confidence === 'high' ? '' : ` · ${result.confidence}`;
    const { value, label } = this._fmt(result.speedKmh);
    this.$speed.innerHTML =
      `<span class="${cls}">${value.toFixed(1)}</span><small> ${label}${tag}</small>`;
  }
  // Canonical km/h → display value + label in the current unit (used for TTS too).
  displaySpeed(kmh) {
    return this._fmt(kmh);
  }
  setUnitLabel(unit) {
    this.unit = unit;
    this.$unitBtn.textContent = unit === 'mph' ? 'mph' : 'km/h';
  }
  setDirLabel(direction) {
    const arrow = direction === 'left' ? '← Left' : '→ Right';
    this.$dirBtn.textContent = `Shots: ${arrow}`;
    this.$dirStat.textContent = arrow;
  }
  onUnitClick(handler) {
    this.$unitBtn.addEventListener('click', handler);
  }
  setMinSpeedLabel(kmh) {
    this.$minSpeed.textContent = `Min ${kmh} km/h`;
    this.$minStat.textContent = `${kmh} km/h`;
  }
  onMinSpeedClick(dir, handler) {
    this.root.querySelector(dir === 'up' ? '#minUpBtn' : '#minDownBtn').addEventListener('click', handler);
  }
  onDirClick(handler) {
    this.$dirBtn.addEventListener('click', handler);
  }
  onResetClick(handler) {
    this.root.querySelector('#resetBtn').addEventListener('click', handler);
  }
  // iOS requires getUserMedia to be triggered by a user gesture, so the camera
  // starts from this button rather than on page load.
  onStart(handler) {
    this.root.querySelector('#startBtn').addEventListener('click', handler);
  }
  dismissStart() {
    const btn = this.root.querySelector('#startBtn');
    if (btn) btn.remove();
  }
  onCalibrateClick(handler) {
    this.root.querySelector('#calBtn').addEventListener('click', handler);
  }
  // Show the crosshair and let the user drag it (finger anywhere on the preview)
  // to position it over the puck. Position is tracked as a fraction of the preview.
  enableCrosshair() {
    this.$crosshair.hidden = false;
    this.positionCrosshair();
    let dragging = false;
    const move = (ev) => {
      const rect = this.$preview.getBoundingClientRect();
      // The window only shows the [zoomBase, zoomBase+zoomScale] slice of the frame,
      // so map the pointer's position within the window into that slice.
      const localX = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      this.crossFx = this.zoomBase + localX * this.zoomScale;
      this.crossFy = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
      this.positionCrosshair();
      ev.preventDefault();
    };
    this.$preview.addEventListener('pointerdown', (ev) => { dragging = true; move(ev); });
    this.$preview.addEventListener('pointermove', (ev) => { if (dragging) move(ev); });
    this.$preview.addEventListener('pointerup', () => { dragging = false; });
    this.$preview.addEventListener('pointercancel', () => { dragging = false; });
  }
  positionCrosshair() {
    this.$crosshair.style.left = `${this.crossFx * 100}%`;
    this.$crosshair.style.top = `${this.crossFy * 100}%`;
  }
  // Calibration view: magnify the preview 3× onto the third of the frame where the
  // puck rests — the side it launches *from*. A → Right shot starts on the left,
  // so show the left third; a ← Left shot starts on the right, so show the right third.
  // Detection still uses the full frame; only the on-screen window is cropped.
  zoomToSide(direction) {
    this.$preview.hidden = false;
    this._zoomed = true;
    this.zoomScale = 1 / 3;
    this.zoomBase = direction === 'left' ? 2 / 3 : 0;
    this.$frame.style.width = '300%';
    this.$frame.style.transform = `translateX(${-this.zoomBase * 100}%)`;
    // Re-centre the crosshair into the visible third.
    this.crossFx = this.zoomBase + this.zoomScale / 2;
    this.crossFy = 0.5;
    this.positionCrosshair();
  }
  // After calibration the video isn't needed — hide the whole preview.
  hidePreview() {
    this._zoomed = false;
    this.$preview.hidden = true;
  }
  isCalibrating() {
    return this._zoomed;
  }
  // Current crosshair position as a fraction {fx, fy} of the preview / detection frame.
  getCrosshairFraction() {
    return { fx: this.crossFx, fy: this.crossFy };
  }
  // Draw the detected puck box on the overlay (box is in detection-pixel space).
  showCalibrationBox(box, detectWidth, detectHeight) {
    const l = (box.minX / detectWidth) * 100;
    const t = (box.minY / detectHeight) * 100;
    const w = (box.widthPx / detectWidth) * 100;
    const h = (box.heightPx / detectHeight) * 100;
    this.$overlay.innerHTML = `<div class="calbox" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%"></div>`;
  }
  // Debug: draw the detected shot track as dots (points in detection-pixel space).
  showTrack(track, detectWidth, detectHeight) {
    this.$overlay.innerHTML = track.points
      .map((p) => {
        const l = (p.x / detectWidth) * 100;
        const t = (p.y / detectHeight) * 100;
        return `<div class="track-dot" style="left:${l}%;top:${t}%"></div>`;
      })
      .join('');
  }
  clearOverlay() {
    this.$overlay.innerHTML = '';
  }
}
