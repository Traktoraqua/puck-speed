export class UI {
  constructor(root = document.getElementById('app')) {
    this.root = root;
    this.root.innerHTML = `
      <button id="startBtn" class="start-btn">▶ Tap to start camera</button>
      <div class="preview">
        <div class="badge" id="fps">-- fps</div>
        <div class="overlay" id="overlay"></div>
        <div class="crosshair" id="crosshair" hidden></div>
      </div>
      <div id="warn"></div>
      <div class="speed" id="speed"><small>drag the crosshair onto the puck</small></div>
      <div class="history" id="history"></div>
      <div style="padding:6px;text-align:center"><button id="calBtn">Calibrate</button></div>
    `;
    this.$speed = this.root.querySelector('#speed');
    this.$history = this.root.querySelector('#history');
    this.$warn = this.root.querySelector('#warn');
    this.$fps = this.root.querySelector('#fps');
    this.$preview = this.root.querySelector('.preview');
    this.$overlay = this.root.querySelector('#overlay');
    this.$crosshair = this.root.querySelector('#crosshair');
    this.crossFx = 0.5; // crosshair position as a fraction of the preview
    this.crossFy = 0.5;
  }
  renderPreview(video) {
    video.classList.add('preview-video');
    this.$preview.prepend(video);
  }
  setFpsBadge(fps) {
    this.$fps.textContent = `${Math.round(fps)} fps`;
  }
  showWarning(msg) {
    this.$warn.innerHTML = msg ? `<div class="warn">${msg}</div>` : '';
  }
  showResult(result) {
    const pts = `${result.frameCount} pts`;
    if (result.method === 'none') {
      this.$speed.innerHTML = `<span class="confidence-none">no valid shot</span><small> ${pts}</small>`;
      return;
    }
    const cls = result.confidence === 'low' ? 'confidence-low' : '';
    this.$speed.innerHTML =
      `<span class="${cls}">${result.speedKmh.toFixed(1)}</span><small> km/h · ${result.confidence} · ${pts}</small>`;
  }
  renderHistory(list) {
    this.$history.innerHTML = list.map((v) => `<span>${v.toFixed(1)}</span>`).join('');
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
      this.crossFx = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
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
