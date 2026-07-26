export function makeFrame(mediaTime, width, height, disc = null, bgValue = 20) {
  const gray = new Uint8Array(width * height).fill(bgValue);
  if (disc) {
    const { cx, cy, r, value = 230 } = disc;
    const r2 = r * r;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(height - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(width - 1, Math.ceil(cx + r)); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) gray[y * width + x] = value;
      }
    }
  }
  return { mediaTime, width, height, gray };
}
