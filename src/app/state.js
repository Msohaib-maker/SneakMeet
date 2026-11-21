import { ReportBuilder } from "../vitals/reports.js";
import { CalmMeter } from "../vitals/calm-meter.js";
import { els } from "./dom.js";

export const NO_AUDIO = new URLSearchParams(location.search).get("noaudio") === "1";
export const AUTO_CONSENT =
  new URLSearchParams(location.search).get("autoconsent") === "1";

export const store = {
  get(k, d = "") {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : v;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

export const state = {
  camStream: null,
  placeholder: false,
  stopFps: null,
  mic: null,
  echoGate: null,
  meeting: null,
  joined: false,
  vitals: null,
  measuring: false,
  simulatedActive: false,
  sharing: false,
  my: null,
  self: null,
  peers: new Map(),
  broadcastTimer: null,
  isHost: false,
  dashboard: null,
  consent: null,
  reportTimer: null,
  reportBuilder: new ReportBuilder(),
  calmMeter: new CalmMeter(),
  myCalm: null,
  realVitals: false,
  reportModal: null,
  briefer: null,
  aiPanel: null,
  lobbyScan: null,
  selfScan: null,
  practice: null,
  practiceScan: null,
};

export function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(line);
  els.log.textContent = (line + "\n" + els.log.textContent).slice(0, 8000);
}

export const randomRoom = () => {
  const words = [
    "calm",
    "brisk",
    "sunny",
    "quiet",
    "steady",
    "bright",
    "gentle",
    "lucky",
  ];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;
};

export const fmt = (n) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : String(Math.round(Number(n)));
export const num = (n) =>
  n == null || !Number.isFinite(Number(n)) ? null : Number(n);
export const hostId = () => state.meeting?.hostId || null;
export const hasRemoteHost = () => !!hostId() && !state.isHost;
export const reportingToHost = () => state.consent === "granted" && hasRemoteHost();
