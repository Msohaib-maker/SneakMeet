import { state } from "./state.js";
import { stopReporting } from "./consent.js";
import { els } from "./dom.js";
import { stopMeasuring } from "./measure.js";
import { setLobbyControls, stopMic, watchFps } from "./devices.js";
import { renderScans } from "./toolbar.js";
import { destroyBotOverlay } from "./bot-overlay.js";

export async function leave() {
  clearInterval(state.broadcastTimer);
  state.broadcastTimer = null;
  stopReporting();
  state.consent = null;
  els.consentModal.hidden = true;
  await stopMeasuring();
  state.meeting?.leave();
  state.meeting = null;
  state.joined = false;
  state.briefer?.destroy();
  state.briefer = null;
  state.aiPanel?.destroy();
  state.aiPanel = null;
  if (state.dashboard) {
    state.dashboard.destroy();
    state.dashboard = null;
  }
  state.isHost = false;
  destroyBotOverlay();
  els.hostPanel.hidden = true;
  els.meeting.classList.remove("is-host");
  for (const p of state.peers.values()) p.tile.root.remove();
  state.peers.clear();
  state.selfScan?.destroy();
  state.selfScan = null;
  state.self?.root.remove();
  state.self = null;
  state.reportModal?.close();
  stopMic();
  const camTrack = state.camStream?.getVideoTracks()[0];
  if (camTrack) camTrack.enabled = true;

  els.meeting.hidden = true;
  els.lobby.hidden = false;
  els.roomLabel.hidden = true;
  els.btnJoin.disabled = false;
  setLobbyControls(true);
  watchFps(els.preview);
  renderScans();
}
