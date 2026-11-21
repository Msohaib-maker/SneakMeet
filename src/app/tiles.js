import { NO_AUDIO, fmt, reportingToHost, state } from "./state.js";
import { els } from "./dom.js";
import { ScanOverlay } from "../ui/scan.js";
import { setTool } from "./toolbar.js";

export function createTile(name, isSelf) {
  const root = document.createElement("div");
  root.className = "tile" + (isSelf ? " self" : "");
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  if (isSelf || NO_AUDIO) video.muted = true;
  const label = document.createElement("div");
  label.className = "tile-name";
  label.textContent = isSelf ? `${name} (you)` : name;
  const badges = document.createElement("div");
  badges.className = "tile-badges";
  const vitals = document.createElement("div");
  vitals.className = "tile-vitals";
  vitals.hidden = true;
  root.append(video, label, badges, vitals);
  els.grid.appendChild(root);
  return { root, video, label, badges, vitals };
}

export function renderBadges(tile, s) {
  tile.badges.textContent = "";
  const add = (text, cls) => {
    const b = document.createElement("span");
    b.className = `badge ${cls}`;
    b.textContent = text;
    tile.badges.appendChild(b);
  };
  if (s.isHost) add("Host", "host");
  if (s.reporting) add("Reporting to host", "reporting");
  if (s.sharing) add("Sharing vitals", "sharing");
  else if (s.measuring && !s.reporting) add("Measuring (private)", "");
}

export function renderTileVitals(tile, v, note) {
  if (!v) {
    tile.vitals.hidden = true;
    return;
  }
  tile.vitals.textContent = "";
  const part = (text, stable, cls = "") => {
    const s = document.createElement("span");
    s.textContent = text;
    s.className = `${stable ? "" : "dim"} ${cls}`.trim();
    tile.vitals.appendChild(s);
  };
  part(`❤ ${fmt(v.pulse)} bpm`, v.pulseStable);
  part(`🫁 ${fmt(v.breathing)}/min`, v.breathingStable);
  if (v.hrv != null) part(`HRV ${fmt(v.hrv)} ms`, v.hrvStable);
  const notes = [v.simulated ? "SIMULATED" : "", note || ""]
    .filter(Boolean)
    .join(" · ");
  if (notes) part(notes, true, "note");
  tile.vitals.hidden = false;
}

export function renderSelf() {
  if (!state.self) return;
  renderBadges(state.self, {
    isHost: state.isHost,
    measuring: state.measuring,
    sharing: state.sharing,
    reporting: reportingToHost(),
  });
}

export function renderSelfScan() {
  document.body.classList.toggle("real-vitals", state.realVitals);
  state.meeting?.setLowPower(state.realVitals);
  const on = els.selfScan.checked && !!state.self && !state.realVitals;
  if (on && !state.selfScan)
    state.selfScan = new ScanOverlay(state.self.root, { ambient: true });
  if (!on && state.selfScan) {
    state.selfScan.destroy();
    state.selfScan = null;
  }
  setTool(els.btnSelfScan, on, "◎ Scanner on", "◎ Scanner off");
  els.btnSelfScan.disabled = state.realVitals;
  els.btnSelfScan.title = state.realVitals
    ? "Off while real readings run (keeps the frame rate up)"
    : "Decorative scanner on your own video (only you see it)";
}
