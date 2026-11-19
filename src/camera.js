// Camera helpers: open a webcam mode that sustains >= 25 fps (the SDK minimum),
// optional exposure lock / brightness, a placeholder stream, and an fps meter.

export async function listCameras() {
  // Device labels are only visible after a permission grant; do a quick probe.
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ video: true });
    probe.getTracks().forEach((t) => t.stop());
  } catch { /* no camera or denied; enumerate anyway */ }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

export async function openCamera({ deviceId, resolution, lockExposure, log }) {
  const [width, height] = resolution.split('x').map(Number);
  const video = {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: 30, min: 25 },
  };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
  } catch (e) {
    if (e.name !== 'OverconstrainedError') throw e;
    delete video.frameRate.min;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
  }
  const track = stream.getVideoTracks()[0];
  if (lockExposure) await applyExposureLock(track, log);
  const s = track.getSettings();
  log(`Camera: ${s.width}x${s.height} @ ${s.frameRate ?? '?'} fps`);
  return stream;
}

// Auto-exposure lengthens exposure in dim light, which caps the frame rate.
// Force the longest manual exposure that still fits in one 1/30 s frame.
async function applyExposureLock(track, log) {
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  if (!caps.exposureMode || !caps.exposureMode.includes('manual') || !caps.exposureTime) {
    log('Exposure lock not supported by this camera.');
    return;
  }
  // Chromium exposureTime is in 100 µs units; 1/30 s = 333.
  const { min, max, step = 1 } = caps.exposureTime;
  const limit = Math.min(max, 333);
  const target = Math.max(min, min + Math.floor((limit - min) / step) * step);
  try {
    await track.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureTime: target }] });
  } catch (e) { log(`Exposure lock failed: ${e.message}`); }
}

// Wire a range input to the camera's brightness control, if supported.
export function setupBrightness(track, { slider, wrap, saved, onSave }) {
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  if (!caps.brightness) { wrap.hidden = true; return; }
  const { min, max, step = 1 } = caps.brightness;
  Object.assign(slider, { min, max, step });
  const value = Number.isFinite(saved) && saved >= min && saved <= max ? saved : track.getSettings().brightness;
  slider.value = value;
  wrap.hidden = false;
  track.applyConstraints({ advanced: [{ brightness: Number(value) }] }).catch(() => {});
  slider.oninput = () => {
    const v = Number(slider.value);
    track.applyConstraints({ advanced: [{ brightness: v }] }).catch(() => {});
    onSave(v);
  };
}

// Animated test-pattern stream, used when no camera is available
// (e.g. a second app window on the same laptop while the webcam is in use).
export function createPlaceholderStream(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  let t = 0;
  const draw = () => {
    ctx.fillStyle = '#1a1d26';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e3635f';
    ctx.beginPath();
    ctx.arc(320 + Math.sin(t / 30) * 120, 160, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6e8ef';
    ctx.font = '22px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 320, 290);
    t++;
  };
  draw();
  const timer = setInterval(draw, 1000 / 30);
  const stream = canvas.captureStream(30);
  stream.cleanup = () => clearInterval(timer);
  return stream;
}

export function closeStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  if (stream.cleanup) stream.cleanup();
}

export async function openMic(log) {
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    return s.getAudioTracks()[0];
  } catch (e) {
    log(`Microphone unavailable (${e.name}); joining without audio.`);
    return null;
  }
}

// Count frames actually rendered by a <video>; calls onFps once per second.
export function startFpsMeter(video, onFps) {
  let frames = 0;
  let active = true;
  const tick = () => { frames++; if (active) video.requestVideoFrameCallback(tick); };
  video.requestVideoFrameCallback(tick);
  const timer = setInterval(() => { onFps(frames); frames = 0; }, 1000);
  return () => { active = false; clearInterval(timer); };
}
