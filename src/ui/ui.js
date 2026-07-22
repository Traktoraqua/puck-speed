export class UI {
  constructor(root = document.getElementById('app')) {
    this.root = root;
    this.root.innerHTML = `
      <button id="startBtn" class="start-btn">▶ Tap to start camera</button>
      <div class="preview"><div class="badge" id="fps">-- fps</div><div class="overlay" id="overlay"></div></div>
      <div id="warn"></div>
      <div class="speed" id="speed"><small>tap to calibrate</small></div>
      <div class="history" id="history"></div>
      <div style="padding:12px;text-align:center"><button id="calBtn">Calibrate (tap the puck)</button></div>
    `;
    this.$speed = this.root.querySelector('#speed');
    this.$history = this.root.querySelector('#history');
    this.$warn = this.root.querySelector('#warn');
    this.$fps = this.root.querySelector('#fps');
    this.$preview = this.root.querySelector('.preview');
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
  // Collect a single tap on the preview; resolves with the CSS-space point + element rect.
  collectTap() {
    return new Promise((resolve) => {
      const handler = (ev) => {
        this.$preview.removeEventListener('click', handler);
        resolve({ pt: { x: ev.clientX, y: ev.clientY }, rect: this.$preview.getBoundingClientRect() });
      };
      this.$preview.addEventListener('click', handler);
    });
  }
  // Draw the detected puck box on the overlay (box is in detection-pixel space).
  showCalibrationBox(box, detectWidth, detectHeight) {
    const overlay = this.root.querySelector('#overlay');
    const l = (box.minX / detectWidth) * 100;
    const t = (box.minY / detectHeight) * 100;
    const w = (box.widthPx / detectWidth) * 100;
    const h = (box.heightPx / detectHeight) * 100;
    overlay.innerHTML = `<div class="calbox" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%"></div>`;
  }
  clearOverlay() {
    this.root.querySelector('#overlay').innerHTML = '';
  }
}
