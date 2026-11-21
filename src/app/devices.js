import {
  closeStream,
  createPlaceholderStream,
  listCameras,
  openCamera,
  setupBrightness,
  startFpsMeter,
} from "../media/camera.js";
import { els } from "./dom.js";
import { log, state, store } from "./state.js";

export async function populateCameras() {
  const cams = await listCameras();
  els.camera.innerHTML = "";
  cams.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || `Camera ${i + 1}`;
    els.camera.appendChild(opt);
  });
  const saved = store.get("camera", "");
  if (saved && cams.some((c) => c.deviceId === saved)) els.camera.value = saved;
}

export async function startCamera() {
  stopCamera();
  try {
    state.camStream = await openCamera({
      deviceId: els.camera.value,
      resolution: els.resolution.value,
      lockExposure: els.lockExposure.checked,
      log,
    });
    state.placeholder = false;
    setupBrightness(state.camStream.getVideoTracks()[0], {
      slider: els.brightness,
      wrap: els.brightnessWrap,
      saved: Number(store.get("brightness", "NaN")),
      onSave: (v) => store.set("brightness", String(v)),
    });
  } catch (e) {
    log(`Camera unavailable (${e.name}). Using a placeholder video.`);
    els.lobbyMsg.textContent =
      "Camera unavailable: you can still join; real vitals need a camera.";
    state.camStream = createPlaceholderStream(els.name.value || "No camera");
    state.placeholder = true;
    els.brightnessWrap.hidden = true;
  }
  attachVideo(els.preview, state.camStream);
  watchFps(els.preview);
}

export function stopCamera() {
  if (state.stopFps) {
    state.stopFps();
    state.stopFps = null;
  }
  closeStream(state.camStream);
  state.camStream = null;
}

export function attachVideo(video, stream) {
  video.srcObject = stream;
  video.play().catch(() => {});
}

export function watchFps(video) {
  if (state.stopFps) state.stopFps();
  state.stopFps = startFpsMeter(video, (fps) => {
    const cls = fps >= 25 ? "good" : "low";
    els.fps.textContent = `${fps} fps`;
    els.fps.className = `fps-badge ${cls}`;
    els.camFps.textContent = `${fps} fps${fps < 25 ? " (real vitals need 25+)" : ""}`;
    els.camFps.className = cls;
  });
}

export function setLobbyControls(enabled) {
  for (const el of [els.camera, els.resolution, els.lockExposure])
    el.disabled = !enabled;
}

export function stopMic() {
  if (state.echoGate) {
    state.echoGate.stop();
    state.echoGate = null;
  } else if (state.mic) state.mic.stop();
  state.mic = null;
}
