import { els } from "./dom.js";
import { openSettings } from "./settings.js";
import { log, state } from "./state.js";
import {
  renderMyVitals,
  renderScans,
  setStatus,
  updatePracticeToolbar,
  updateToolbar,
} from "./toolbar.js";
import { renderSelf, renderSelfScan } from "./tiles.js";
import { renderPracticeScan } from "./practice.js";
import { broadcastState } from "./broadcast.js";
import { SimulatedVitals } from "../vitals/simulated.js";
import { VitalsMonitor } from "../vitals/vitals.js";

export async function startMeasuring() {
  const simulated = els.simulated.checked;
  const apiKey = els.apiKey.value.trim();
  if (!simulated) {
    if (!apiKey) {
      openSettings("vitals");
      log("Set your SmartSpectra API key in Settings first.");
      return;
    }
    if (state.placeholder) {
      log(
        "Real vitals need a camera (or enable Simulated vitals in Settings).",
      );
      return;
    }
    if (!state.camStream.getVideoTracks()[0].enabled) {
      log("Turn your camera on to measure vitals.");
      return;
    }
  }

  els.btnMeasure.disabled = true;
  els.btnMeasure.textContent = "Starting…";
  setStatus("Starting", "starting");
  els.hint.textContent = simulated
    ? "Simulated vitals: values are generated, not measured."
    : "Starting the SDK… sit still, face the camera, good light on your face.";
  els.hint.className = "hint-box";

  const callbacks = {
    apiKey,
    log,
    onStatus: (name) =>
      setStatus(`Vitals: ${name}`, name.toLowerCase().split(" ")[0]),
    onHint: (name, hint, ok) => {
      if (name !== state.lastHint) {
        state.lastHint = name;
        log(`[diag] camera check: ${name}${hint ? ` (${hint})` : ""}`);
      }
      for (const h of [els.hint, els.pHint]) {
        h.textContent = hint || name;
        h.className = "hint-box " + (ok ? "ok" : "warn");
      }
    },
    onUpdate: (m) => {
      state.my = m;
      state.reportBuilder.add(m);
      const est = state.calmMeter.add(m);
      state.myCalm = est.ready ? { id: est.level.id, score: est.score } : null;
      state.practice?.feed(m);
      const now = performance.now();
      if (now - (state.lastPaint || 0) < 250) return;
      state.lastPaint = now;
      renderMyVitals(m);
      renderSelf();
      renderScans();
    },
    onError: (code, message) => {
      log(`Vitals error ${code}: ${message}`);
      els.pHint.textContent =
        code === 14
          ? "Readings stopped: camera frame rate too low. Add light on your face (or turn on Screen light / Lock exposure in Settings), then press Readings."
          : `Readings error: ${message}`;
      els.pHint.className = "hint-box warn";
      els.hint.textContent = els.pHint.textContent.replace(
        "press Readings",
        "press Measure vitals",
      );
      els.hint.className = "hint-box warn";
    },
    onStopped: () => {
      state.vitals = null;
      state.measuring = false;
      state.simulatedActive = false;
      state.sharing = false;
      state.my = null;
      state.myCalm = null;
      state.realVitals = false;
      renderSelfScan();
      if (state.practice) renderPracticeScan();
      renderMyVitals(null);
      setStatus("Vitals off");
      state.practice?.vitalsStopped(
        "Readings are off. Press Readings to resume.",
      );
      updateToolbar();
      updatePracticeToolbar();
      renderSelf();
      renderScans();
      broadcastState();
    },
  };
  state.calmMeter.reset();
  state.realVitals = !simulated;
  renderSelfScan();
  if (state.practice) renderPracticeScan();
  const v = simulated
    ? new SimulatedVitals(callbacks)
    : new VitalsMonitor(callbacks);
  state.vitals = v;
  try {
    await v.start(state.camStream);
    if (state.vitals === v) {
      state.measuring = true;
      state.simulatedActive = simulated;
      log(
        simulated
          ? "Measuring (SIMULATED data)."
          : "Measuring with the SmartSpectra SDK.",
      );
    }
  } catch (e) {
    log(`Could not start vitals: ${e.code ?? ""} ${e.message}`);
    state.vitals = null;
    state.realVitals = false;
    renderSelfScan();
    if (state.practice) renderPracticeScan();
    setStatus("Vitals off");
    if (state.practice) {
      els.pHint.textContent = `Could not start readings: ${e.message}`;
      els.pHint.className = "hint-box warn";
    }
  }
  updateToolbar();
  updatePracticeToolbar();
  renderSelf();
  renderScans();
  broadcastState();
}

export async function stopMeasuring() {
  if (state.vitals) await state.vitals.stop();
}
