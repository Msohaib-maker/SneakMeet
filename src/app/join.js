import { els } from "./dom.js";
import { AUTO_CONSENT, NO_AUDIO, log, state, store } from "./state.js";
import { openMic } from "../media/camera.js";
import { EchoGate } from "../media/echo-gate.js";
import { createTile, renderSelf, renderSelfScan } from "./tiles.js";
import { attachVideo, setLobbyControls, stopMic, watchFps } from "./devices.js";
import { Meeting } from "../meeting/meeting.js";
import { addPeer, onPeerData, removePeer, renderPeer } from "./peers.js";
import { broadcastState, stateMessage } from "./broadcast.js";
import { grantConsent, onHostChanged, sendConsent, showConsentModal } from "./consent.js";
import { HostDashboard } from "../host/dashboard.js";
import { AIBriefer } from "../ai/ai-brief.js";
import { HostAIPanel } from "../host/host-ai.js";
import { downloadAllCards } from "./downloads.js";
import { renderMyVitals, renderScans, updateToolbar } from "./toolbar.js";
import { botOverlaySpeak, botOverlayStatus, renderBotOverlay, showBotOverlay } from "./bot-overlay.js";

export async function join() {
  const name = els.name.value.trim();
  const room = els.room.value.trim();
  const serverUrl = els.serverUrl.value.trim() || __DEFAULT_SERVER_URL__;
  if (!name) {
    els.lobbyMsg.textContent = "Enter your name.";
    els.name.focus();
    return;
  }
  if (!room) {
    els.lobbyMsg.textContent = "Enter a room code.";
    els.room.focus();
    return;
  }
  store.set("name", name);
  store.set("room", room);
  store.set("asHost", els.asHost.checked ? "1" : "0");

  els.btnJoin.disabled = true;
  els.lobbyMsg.textContent = "Connecting…";
  const rawMic = NO_AUDIO ? null : await openMic(log);
  state.mic = rawMic;
  if (rawMic) {
    try {
      state.echoGate = new EchoGate(rawMic);
      state.echoGate.setEnabled(els.echoGate.checked);
      state.mic = state.echoGate.track;
    } catch (e) {
      log(`Echo suppression unavailable (${e.message}).`);
    }
  }
  if (NO_AUDIO)
    log("Test instance: audio disabled to avoid echo on the same laptop.");
  const localStream = new MediaStream([
    ...state.camStream.getVideoTracks(),
    ...(state.mic ? [state.mic] : []),
  ]);

  els.grid.textContent = "";
  state.self = createTile(name, true);
  attachVideo(state.self.video, state.camStream);

  const meeting = new Meeting({
    serverUrl,
    room,
    name,
    localStream,
    log,
    host: els.asHost.checked,
    onPeerJoined: addPeer,
    onPeerLeft: removePeer,
    onPeerStream: (id, s) => {
      const p = state.peers.get(id);
      if (!p) return;
      if (p.tile.video.srcObject !== s) attachVideo(p.tile.video, s);
      p.stream = s;
      state.echoGate?.addRemote(s);
    },
    onPeerData,
    onChannelOpen: (id) => {
      meeting.sendTo(id, stateMessage());
      if (id === meeting.hostId && !state.isHost) {
        sendConsent();
        if (state.consent === "pending") {
          if (AUTO_CONSENT) grantConsent();
          else showConsentModal();
        }
      }
    },
    onHostChanged,
    onDisconnected: () =>
      log(
        "Lost connection to the meeting server (existing calls may continue).",
      ),
  });
  state.meeting = meeting;

  try {
    await meeting.join();
  } catch (e) {
    state.meeting = null;
    els.lobbyMsg.textContent = e.message;
    els.btnJoin.disabled = false;
    state.self.root.remove();
    state.self = null;
    stopMic();
    for (const p of state.peers.values()) p.tile.root.remove();
    state.peers.clear();
    return;
  }

  state.joined = true;
  state.isHost = meeting.hostId === meeting.id;
  if (els.asHost.checked && !state.isHost)
    log("This room already has a host: you joined as a participant.");

  if (state.isHost) {
    state.dashboard = new HostDashboard(els.hostCards, {
      onOpen: (id) => state.reportModal.open(id),
      onChange: (id) => state.reportModal.refresh(id),
      getBrief: (id) => state.briefer?.latest(id) || null,
      onBrief: (id) => {
        const ok = state.briefer?.request(id);
        if (!ok)
          log(
            els.aiProvider.value === "off"
              ? "AI summaries are off (⚙ AI briefs)."
              : "No summary yet: wait for their first readings, or for the AI pause to end.",
          );
        state.dashboard?.refreshBots();
      },
      isBriefing: (id) => !!state.briefer?.isWorkingOn(id),
    });
    state.briefer = new AIBriefer({
      getMembers: () => state.dashboard?.list() || [],
      getConfig: () => ({
        provider: els.aiProvider.value,
        apiKey: els.geminiKey.value.trim(),
      }),
      onUpdate: (ids) => {
        state.dashboard?.render();
        for (const id of ids) state.reportModal.refresh(id);
        botOverlaySpeak(ids);
        log(
          `AI briefs updated for ${ids
            .map((id) => state.dashboard?.getMember(id)?.name)
            .filter(Boolean)
            .join(", ")}`,
        );
      },
      onStatus: () => {
        state.aiPanel?.render();
        state.dashboard?.refreshBots();
        botOverlayStatus();
      },
      log,
    });
    state.aiPanel = new HostAIPanel(els.hostAi, {
      briefer: state.briefer,
      getProvider: () => els.aiProvider.value,
      onDownloadAll: downloadAllCards,
      onBot: showBotOverlay,
    });
    for (const [id, p] of state.peers) state.dashboard.addMember(id, p.name);
    els.hostPanel.hidden = false;
    els.meeting.classList.add("is-host");
    renderBotOverlay();
    log(
      "You are the host. Participants will be asked to consent to sending you reports.",
    );
  } else if (meeting.hostId) {
    state.consent = "pending";
  }

  els.lobbyMsg.textContent = "";
  els.lobby.hidden = true;
  els.meeting.hidden = false;
  els.roomLabel.textContent = `Room: ${room.toLowerCase()}${state.isHost ? " · You are the host" : ""}`;
  els.roomLabel.hidden = false;
  setLobbyControls(false);
  watchFps(state.self.video);
  updateToolbar();
  renderMyVitals(state.my);
  renderSelf();
  renderSelfScan();
  renderScans();
  for (const id of state.peers.keys()) renderPeer(id);
  state.broadcastTimer = setInterval(broadcastState, 1000);
  log(`Joined room "${room.toLowerCase()}" as ${name}`);
}
