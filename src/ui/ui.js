export class UI {
  constructor(root = document.getElementById('app')) {
    this.root = root;
    this.root.innerHTML = `
      <div class="preview"><div class="badge" id="fps">-- fps</div><div class="overlay" id="overlay"></div></div>
      <div id="warn"></div>
      <div class="speed" id="speed"><small>tap to calibrate</small></div>
      <div class="history" id="history"></div>
      <div style="padding:12px;text-align:center"><button id="calBtn">Calibrate (puck edges)</button></div>
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
    if (result.method === 'none') {
      this.$speed.innerHTML = `<span class="confidence-none">no valid shot</span>`;
      return;
    }
    const cls = result.confidence === 'low' ? 'confidence-low' : '';
    this.$speed.innerHTML =
      `<span class="${cls}">${result.speedKmh.toFixed(1)}</span><small> km/h · ${result.confidence}</small>`;
  }
  renderHistory(list) {
    this.$history.innerHTML = list.map((v) => `<span>${v.toFixed(1)}</span>`).join('');
  }
  onCalibrateClick(handler) {
    this.root.querySelector('#calBtn').addEventListener('click', handler);
  }
  // Collect two taps on the preview; resolves with the two CSS-space points + element rect.
  collectTwoTaps() {
    return new Promise((resolve) => {
      const pts = [];
      const handler = (ev) => {
        pts.push({ x: ev.clientX, y: ev.clientY });
        if (pts.length === 2) {
          this.$preview.removeEventListener('click', handler);
          resolve({ pts, rect: this.$preview.getBoundingClientRect() });
        }
      };
      this.$preview.addEventListener('click', handler);
    });
  }
}
