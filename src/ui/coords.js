export function cssToDetection(point, rect, detectWidth, detectHeight) {
  const fx = (point.x - rect.left) / rect.width;
  const fy = (point.y - rect.top) / rect.height;
  return { x: fx * detectWidth, y: fy * detectHeight };
}
