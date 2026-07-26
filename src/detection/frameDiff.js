export function absDiff(a, b) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Math.abs(a[i] - b[i]);
  return out;
}

export function threshold(diff, level) {
  const out = new Uint8Array(diff.length);
  for (let i = 0; i < diff.length; i++) out[i] = diff[i] >= level ? 1 : 0;
  return out;
}
