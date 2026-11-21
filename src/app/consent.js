import { hasRemoteHost, hostId, log, reportingToHost, state } from "./state.js";
import { els } from "./dom.js";
import { startMeasuring } from "./measure.js";
import { updateToolbar } from "./toolbar.js";
import { renderSelf } from "./tiles.js";
import { broadcastState } from "./broadcast.js";
import { REPORT_INTERVAL_MS } from "../vitals/reports.js";
import { renderPeer } from "./peers.js";

export function sendConsent() {
  if (!hasRemoteHost() || !state.consent) return;
  state.meeting.sendTo(hostId(), { type: "consent", status: state.consent });
}

export function showConsentModal() {
  const host = state.peers.get(hostId());
  els.consentHost.textContent = host ? host.name : "The host";
  els.consentModal.hidden = false;
  els.btnConsentYes.focus();
}

export async function grantConsent() {
  els.consentModal.hidden = true;
  state.consent = "granted";
  sendConsent();
  log("You agreed to send wellness reports to the host.");
  if (!state.measuring && !state.vitals) await startMeasuring();
  startReporting();
  updateToolbar();
  renderSelf();
  broadcastState();
}

function declineConsent() {
  els.consentModal.hidden = true;
  state.consent = "declined";
  sendConsent();
  log("You declined to send reports to the host.");
  updateToolbar();
}

export function revokeConsent() {
  state.consent = "revoked";
  stopReporting();
  sendConsent();
  log("Stopped sending reports to the host.");
  updateToolbar();
  renderSelf();
  broadcastState();
}

function startReporting() {
  stopReporting();
  state.reportBuilder.reset();
  state.reportTimer = setInterval(() => {
    if (!reportingToHost()) return;
    const report = state.reportBuilder.build({
      measuring: state.measuring,
      simulated: state.simulatedActive,
    });
    report.calm = state.myCalm;
    state.meeting.sendTo(hostId(), report);
  }, REPORT_INTERVAL_MS);
}

export function stopReporting() {
  clearInterval(state.reportTimer);
  state.reportTimer = null;
}

export function onHostChanged(id) {
  if (!id) {
    if (state.consent === "granted") log("The host left: reports stopped.");
    stopReporting();
    state.consent = null;
    els.consentModal.hidden = true;
  } else if (!state.isHost && state.consent == null) {
    state.consent = "pending";
  }
  for (const pid of state.peers.keys()) renderPeer(pid);
  updateToolbar();
  renderSelf();
}
