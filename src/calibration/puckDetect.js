// Flood-fill the connected dark region touched at (tx,ty) and return its pixel
// extent. Used for calibration: on a black puck / white sheet, one tap on the
// puck yields its on-screen width, which equals the known 76.2 mm diameter.
export function measureDarkBlob(gray, width, height, tx, ty, opts = {}) {
  if (tx < 0 || ty < 0 || tx >= width || ty >= height) return null;
  const v0 = gray[ty * width + tx];
  // Adaptive threshold: everything within +60 of the tapped (dark) value counts
  // as puck, clamped so a bright-tap or odd lighting can't swallow the sheet.
  const darkLevel = opts.darkLevel ?? Math.max(60, Math.min(160, v0 + 60));
  if (v0 >= darkLevel) return null; // the tap wasn't on a dark region

  const seen = new Uint8Array(width * height);
  const start = ty * width + tx;
  const stack = [start];
  seen[start] = 1;
  let minX = tx, maxX = tx, minY = ty, maxY = ty, count = 0;

  while (stack.length) {
    const p = stack.pop();
    const x = p % width;
    const y = (p - x) / width;
    count++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x > 0 && !seen[p - 1] && gray[p - 1] < darkLevel) { seen[p - 1] = 1; stack.push(p - 1); }
    if (x < width - 1 && !seen[p + 1] && gray[p + 1] < darkLevel) { seen[p + 1] = 1; stack.push(p + 1); }
    if (y > 0 && !seen[p - width] && gray[p - width] < darkLevel) { seen[p - width] = 1; stack.push(p - width); }
    if (y < height - 1 && !seen[p + width] && gray[p + width] < darkLevel) { seen[p + width] = 1; stack.push(p + width); }
  }

  return { minX, minY, maxX, maxY, widthPx: maxX - minX + 1, heightPx: maxY - minY + 1, count };
}
