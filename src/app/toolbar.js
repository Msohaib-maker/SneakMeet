import { fmt, hasRemoteHost, reportingToHost, state } from "./state.js";
import { els } from "./dom.js";
import { WARMUP } from "../vitals/vitals.js";

export function renderScans() {
  const s = {
    measuring: state.measuring,
    simulated: state.simulatedActive,
    my: state.my,
  };
  state.lobbyScan?.update(s);
  els.btnScan.textContent = state.measuring ? "■ Stop scan" : "◎ Start scan";
  els.btnScan.classList.toggle("on", state.measuring);
}

export function setStatus(text, cls = "") {
  els.status.textContent = text;
  els.status.className = `status ${cls}`;
}

export function renderMyVitals(m) {
  const show = (el, value, stable, warmupSecs) => {
    if (value == null) {
      const left = Math.max(0, Math.ceil(warmupSecs - (m?.elapsed ?? 0)));
      el.textContent = "";
      const w = document.createElement("span");
      w.className = "warm";
      w.textContent = m ? `warming up${left ? ` ~${left}s` : "…"}` : "—";
      el.appendChild(w);
      el.className = "value";
      return;
    }
    el.textContent = fmt(value);
    el.className = "value" + (stable ? "" : " dim");
  };
  show(els.vPulse, m?.pulse, m?.pulseStable, WARMUP.pulse);
  show(els.vBreath, m?.breathing, m?.breathingStable, WARMUP.breathing);
  show(els.vHrv, m?.hrv, m?.hrvStable, WARMUP.hrv);
}

export function setTool(btn, on, onText, offText) {
  btn.classList.toggle("on", on);
  btn.textContent = on ? onText : offText;
}

export function updateToolbar() {
  const camOn = !!state.camStream?.getVideoTracks()[0]?.enabled;
  setTool(
    els.btnMic,
    !!state.mic?.enabled,
    "Mic on",
    state.mic ? "Mic off" : "No mic",
  );
  els.btnMic.disabled = !state.mic;
  els.btnMic.classList.toggle("off", !!state.mic && !state.mic.enabled);
  setTool(els.btnCam, camOn, "Camera on", "Camera off");
  els.btnCam.classList.toggle("off", !camOn);
  els.btnMeasure.disabled = false;
  setTool(els.btnMeasure, state.measuring, "Measuring ✓", "Measure vitals");
  els.btnShare.disabled = !state.measuring;
  setTool(els.btnShare, state.sharing, "Sharing ✓", "Share vitals");
  els.btnHostReport.hidden = !hasRemoteHost();
  els.myVitals.hidden = state.isHost && !state.measuring && !state.vitals;
  setTool(
    els.btnHostReport,
    reportingToHost(),
    "Reporting to host ✓",
    "Report to host",
  );
}

export function updatePracticeToolbar() {
  const camOn = !!state.camStream?.getVideoTracks()[0]?.enabled;
  setTool(els.btnPCam, camOn, "Camera on", "Camera off");
  els.btnPCam.classList.toggle("off", !camOn);
  setTool(
    els.btnPMeasure,
    state.measuring,
    "Readings on",
    state.vitals ? "Starting…" : "Readings off",
  );
  els.btnPMeasure.classList.toggle("off", !state.measuring && !state.vitals);
  setTool(els.btnPScan, !!state.practiceScan, "◎ Scanner on", "◎ Scanner off");
  els.btnPScan.disabled = state.realVitals;
  els.btnPScan.title = state.realVitals
    ? "Off while real readings run (keeps the frame rate up)"
    : "Decorative scanner on your video";
}
