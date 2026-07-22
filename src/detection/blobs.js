export function principalAxis(sxx, syy, sxy) {
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lambda = tr / 2 + disc; // larger eigenvalue (variance along major axis)
  const majorLength = 4 * Math.sqrt(Math.max(0, lambda)); // ~4 standard deviations
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { majorLength, angle };
}

export function connectedComponents(mask, width, height, minPixels = 1) {
  const labels = new Int32Array(width * height);
  const blobs = [];
  const stack = [];
  let current = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0 || labels[i] !== 0) continue;
    current++;
    stack.length = 0;
    stack.push(i);
    labels[i] = current;
    let count = 0, sumX = 0, sumY = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    const xs = [], ys = [];
    while (stack.length) {
      const p = stack.pop();
      const x = p % width;
      const y = (p - x) / width;
      count++; sumX += x; sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      xs.push(x); ys.push(y);
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = current; stack.push(p - 1); }
      if (x < width - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = current; stack.push(p + 1); }
      if (y > 0 && mask[p - width] && !labels[p - width]) { labels[p - width] = current; stack.push(p - width); }
      if (y < height - 1 && mask[p + width] && !labels[p + width]) { labels[p + width] = current; stack.push(p + width); }
    }
    if (count < minPixels) continue;
    const cx = sumX / count, cy = sumY / count;
    let sxx = 0, syy = 0, sxy = 0;
    for (let k = 0; k < xs.length; k++) {
      const dx = xs[k] - cx, dy = ys[k] - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    sxx /= count; syy /= count; sxy /= count;
    const { majorLength, angle } = principalAxis(sxx, syy, sxy);
    blobs.push({ count, cx, cy, minX, minY, maxX, maxY, majorLength, angle });
  }
  return blobs;
}
