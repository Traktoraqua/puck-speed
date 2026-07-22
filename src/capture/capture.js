import { RingBuffer } from './ringBuffer.js';

export function toGray(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return gray;
}

export async function startCapture({
  windowMs = 600,
  requestedFps = 60,
  detectWidth = 480,
  bandFraction = 0.1, // keep only a centered horizontal stripe (the puck's path)
  onSettings,
} = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { frameRate: { ideal: requestedFps }, facingMode: 'environment' },
    audio: true,
  });
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  if (onSettings) onSettings(settings);

  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();

  if (!video.videoWidth) {
    await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
  }

  // Source: a centered horizontal band of the camera frame (full width, bandFraction tall).
  const srcBandH = Math.max(1, Math.round(video.videoHeight * bandFraction));
  const srcBandY = Math.round((video.videoHeight - srcBandH) / 2);
  const scale = detectWidth / video.videoWidth;
  const dw = detectWidth;
  const dh = Math.max(1, Math.round(srcBandH * scale)); // band height in detection pixels

  // Visible canvas = exactly what detection sees, so preview/crosshair/dots align.
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const ring = new RingBuffer(windowMs);
  let running = true;

  function onFrame(now, meta) {
    if (!running) return;
    ctx.drawImage(video, 0, srcBandY, video.videoWidth, srcBandH, 0, 0, dw, dh);
    const img = ctx.getImageData(0, 0, dw, dh);
    ring.push({ t: now, mediaTime: meta.mediaTime, width: dw, height: dh, gray: toGray(img) });
    video.requestVideoFrameCallback(onFrame);
  }
  video.requestVideoFrameCallback(onFrame);

  return {
    stream, video, canvas, ring, settings, detectWidth: dw, detectHeight: dh,
    stop() {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
