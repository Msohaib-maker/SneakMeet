// Presage Meet renderer: lobby -> meeting with opt-in, on-device vitals,
// and consent-based periodic wellness reports to the meeting host.
import {
  listCameras, openCamera, setupBrightness, createPlaceholderStream,
  closeStream, openMic, startFpsMeter,
} from './camera.js';
import { VitalsMonitor, WARMUP } from './vitals.js';
import { SimulatedVitals } from './simulated.js';
import { ReportBuilder, REPORT_INTERVAL_MS } from './reports.js';
import { HostDashboard, topExpression } from './host-dashboard.js';
import { Meeting } from './meeting.js';
import { ScanOverlay } from './scan.js';
import { ReportModal } from './report-modal.js';
import { AIBriefer } from './ai-brief.js';
import { HostAIPanel, reportCardMarkdown, allReportsMarkdown, downloadText } from './host-ai.js';

/* global __DEFAULT_API_KEY__, __DEFAULT_GEMINI_KEY__, __DEFAULT_SERVER_URL__ */

const $ = (id) => document.getElementById(id);
const els = {
  // header / settings
  roomLabel: $('room-label'), status: $('status'), btnSettings: $('btn-settings'), settings: $('settings'),
  apiKey: $('api-key'), geminiKey: $('gemini-key'), btnShowKey: $('btn-show-key'), serverUrl: $('server-url'),
  camera: $('camera'), resolution: $('resolution'), lockExposure: $('lock-exposure'),
  screenLight: $('screen-light'), simulated: $('simulated'), aiProvider: $('ai-provider'),
  brightness: $('brightness'), brightnessWrap: $('brightness-wrap'),
  keyStatus: $('key-status'), btnSaveSettings: $('btn-save-settings'),
  // lobby
  lobby: $('lobby'), preview: $('preview'), previewWrap: $('preview-wrap'), btnScan: $('btn-scan'), fps: $('fps'), name: $('name'), room: $('room'),
  btnNewRoom: $('btn-new-room'), asHost: $('as-host'), btnJoin: $('btn-join'), lobbyMsg: $('lobby-msg'),
  // meeting
  meeting: $('meeting'), grid: $('grid'), vPulse: $('v-pulse'), vBreath: $('v-breath'), vHrv: $('v-hrv'),
  hint: $('hint'), camFps: $('cam-fps'), log: $('log'),
  hostPanel: $('host-panel'), hostCards: $('host-cards'), hostAi: $('host-ai'), btnExport: $('btn-export'),
  btnMic: $('btn-mic'), btnCam: $('btn-cam'), btnMeasure: $('btn-measure'), btnShare: $('btn-share'),
  btnHostReport: $('btn-host-report'), btnLeave: $('btn-leave'),
  // consent
  consentModal: $('consent-modal'), consentHost: $('consent-host'),
  btnConsentYes: $('btn-consent-yes'), btnConsentNo: $('btn-consent-no'),
  reportModal: $('report-modal'),
};

// Same-machine test instance: no mic, incoming audio muted (prevents echo).
const NO_AUDIO = new URLSearchParams(location.search).get('noaudio') === '1';
// Automated testing only (MEET_AUTOCONSENT=1): skips the consent dialog.
const AUTO_CONSENT = new URLSearchParams(location.search).get('autoconsent') === '1';

const store = {
  get(k, d = '') { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const state = {
  camStream: null,      // video-only stream (real camera or placeholder)
  placeholder: false,
  stopFps: null,
  mic: null,
  meeting: null,
  joined: false,
  vitals: null,         // VitalsMonitor | SimulatedVitals
  measuring: false,
  simulatedActive: false,
  sharing: false,       // live overlay shared with everyone
  my: null,
  self: null,
  peers: new Map(),     // id -> { name, tile, last }
  broadcastTimer: null,
  // host reporting
  isHost: false,
  dashboard: null,
  consent: null,        // participant: null | 'pending' | 'granted' | 'declined' | 'revoked'
  reportTimer: null,
  reportBuilder: new ReportBuilder(),
  reportModal: null,
  briefer: null,        // host: AI brief scheduler
  aiPanel: null,        // host: bot + status
  // scan HUDs
  lobbyScan: null,         // your own pre-join check (lobby only)
};

function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(line);
  els.log.textContent = (line + '\n' + els.log.textContent).slice(0, 8000);
}

const randomRoom = () => {
  const words = ['calm', 'brisk', 'sunny', 'quiet', 'steady', 'bright', 'gentle', 'lucky'];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;
};

const fmt = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : String(Math.round(Number(n))));
const num = (n) => (n == null || !Number.isFinite(Number(n)) ? null : Number(n));
const hostId = () => state.meeting?.hostId || null;
const hasRemoteHost = () => !!hostId() && !state.isHost;
const reportingToHost = () => state.consent === 'granted' && hasRemoteHost();

// --- Settings --------------------------------------------------------------

function loadSettings() {
  els.apiKey.value = store.get('apiKey', __DEFAULT_API_KEY__);
  els.serverUrl.value = store.get('serverUrl', '') || __DEFAULT_SERVER_URL__;
  els.resolution.value = store.get('resolution', '640x480');
  els.lockExposure.checked = store.get('lockExposure', '1') === '1';
  els.screenLight.checked = store.get('screenLight', '0') === '1';
  const simParam = new URLSearchParams(location.search).get('simulated');
  els.simulated.checked = simParam ? simParam === '1' : store.get('simulated', '1') === '1';
  els.geminiKey.value = store.get('geminiKey', __DEFAULT_GEMINI_KEY__);
  els.aiProvider.value = store.get('aiProvider', els.geminiKey.value ? 'gemini' : 'preview');
  if (!els.aiProvider.value) els.aiProvider.value = 'preview';
  els.asHost.checked = store.get('asHost', '0') === '1';
  els.name.value = store.get('name', '');
  els.room.value = store.get('room', '') || randomRoom();
  applyScreenLight();
  updateKeyStatus();
}

function saveSettings() {
  store.set('apiKey', els.apiKey.value.trim());
  store.set('serverUrl', els.serverUrl.value.trim());
  store.set('resolution', els.resolution.value);
  store.set('lockExposure', els.lockExposure.checked ? '1' : '0');
  store.set('simulated', els.simulated.checked ? '1' : '0');
  store.set('aiProvider', els.aiProvider.value);
  store.set('geminiKey', els.geminiKey.value.trim());
  store.set('camera', els.camera.value);
  updateKeyStatus();
}

function updateKeyStatus() {
  const k = els.apiKey.value.trim();
  const keyText = k ? `API key set (…${k.slice(-4)})` : 'No API key set: real vitals cannot start.';
  els.keyStatus.textContent = els.simulated.checked ? `${keyText} · Simulated vitals ON (no credits used)` : keyText;
}

function applyScreenLight() {
  document.body.classList.toggle('screen-light', els.screenLight.checked);
}

// --- Camera ----------------------------------------------------------------

async function populateCameras() {
  const cams = await listCameras();
  els.camera.innerHTML = '';
  cams.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Camera ${i + 1}`;
    els.camera.appendChild(opt);
  });
  const saved = store.get('camera', '');
  if (saved && cams.some((c) => c.deviceId === saved)) els.camera.value = saved;
}

async function startCamera() {
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
      saved: Number(store.get('brightness', 'NaN')),
      onSave: (v) => store.set('brightness', String(v)),
    });
  } catch (e) {
    log(`Camera unavailable (${e.name}). Using a placeholder video.`);
    els.lobbyMsg.textContent = 'Camera unavailable: you can still join; real vitals need a camera.';
    state.camStream = createPlaceholderStream(els.name.value || 'No camera');
    state.placeholder = true;
    els.brightnessWrap.hidden = true;
  }
  attachVideo(els.preview, state.camStream);
  watchFps(els.preview);
}

function stopCamera() {
  if (state.stopFps) { state.stopFps(); state.stopFps = null; }
  closeStream(state.camStream);
  state.camStream = null;
}

function attachVideo(video, stream) {
  video.srcObject = stream;
  video.play().catch(() => {});
}

function watchFps(video) {
  if (state.stopFps) state.stopFps();
  state.stopFps = startFpsMeter(video, (fps) => {
    const cls = fps >= 25 ? 'good' : 'low';
    els.fps.textContent = `${fps} fps`;
    els.fps.className = `fps-badge ${cls}`;
    els.camFps.textContent = `${fps} fps${fps < 25 ? ' (real vitals need 25+)' : ''}`;
    els.camFps.className = cls;
  });
}

// --- Tiles -----------------------------------------------------------------

function createTile(name, isSelf) {
  const root = document.createElement('div');
  root.className = 'tile' + (isSelf ? ' self' : '');
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  if (isSelf || NO_AUDIO) video.muted = true;
  const label = document.createElement('div');
  label.className = 'tile-name';
  label.textContent = isSelf ? `${name} (you)` : name;
  const badges = document.createElement('div');
  badges.className = 'tile-badges';
  const vitals = document.createElement('div');
  vitals.className = 'tile-vitals';
  vitals.hidden = true;
  root.append(video, label, badges, vitals);
  els.grid.appendChild(root);
  return { root, video, label, badges, vitals };
}

// s: { isHost, measuring, sharing, reporting }
function renderBadges(tile, s) {
  tile.badges.textContent = '';
  const add = (text, cls) => {
    const b = document.createElement('span');
    b.className = `badge ${cls}`;
    b.textContent = text;
    tile.badges.appendChild(b);
  };
  if (s.isHost) add('Host', 'host');
  if (s.reporting) add('Reporting to host', 'reporting');
  if (s.sharing) add('Sharing vitals', 'sharing');
  else if (s.measuring && !s.reporting) add('Measuring (private)', '');
}

// v: { pulse, pulseStable, breathing, breathingStable, hrv, hrvStable, simulated } or null
function renderTileVitals(tile, v, note) {
  if (!v) { tile.vitals.hidden = true; return; }
  tile.vitals.textContent = '';
  const part = (text, stable, cls = '') => {
    const s = document.createElement('span');
    s.textContent = text;
    s.className = `${stable ? '' : 'dim'} ${cls}`.trim();
    tile.vitals.appendChild(s);
  };
  part(`❤ ${fmt(v.pulse)} bpm`, v.pulseStable);
  part(`🫁 ${fmt(v.breathing)}/min`, v.breathingStable);
  if (v.hrv != null) part(`HRV ${fmt(v.hrv)} ms`, v.hrvStable);
  const notes = [v.simulated ? 'SIMULATED' : '', note || ''].filter(Boolean).join(' · ');
  if (notes) part(notes, true, 'note');
  tile.vitals.hidden = false;
}

function renderSelf() {
  if (!state.self) return;
  renderBadges(state.self, {
    isHost: state.isHost, measuring: state.measuring, sharing: state.sharing, reporting: reportingToHost(),
  });
  renderTileVitals(state.self, state.sharing ? state.my : null, 'visible to others');
}

// --- Peers -----------------------------------------------------------------

function addPeer(id, name) {
  if (state.peers.has(id)) return;
  const p = { name, tile: createTile(name, false), last: null, live: null, liveAt: 0, scan: null };
  state.peers.set(id, p);
  renderPeer(id);
  state.dashboard?.addMember(id, name);
  log(`${name} joined`);
}

function removePeer(id) {
  const p = state.peers.get(id);
  if (!p) return;
  p.tile.root.remove();
  state.peers.delete(id);
  state.dashboard?.memberLeft(id);
  log(`${p.name} left`);
}

function renderPeer(id) {
  const p = state.peers.get(id);
  if (!p) return;
  const m = p.last || {};
  renderBadges(p.tile, {
    isHost: id === hostId(), measuring: !!m.measuring, sharing: !!m.sharing, reporting: !!m.reportingToHost,
  });
  const v = m.sharing && m.vitals ? {
    pulse: num(m.vitals.pulse), pulseStable: !!m.vitals.pulseStable,
    breathing: num(m.vitals.breathing), breathingStable: !!m.vitals.breathingStable,
    hrv: num(m.vitals.hrv), hrvStable: !!m.vitals.hrvStable, simulated: !!m.vitals.simulated,
  } : null;
  renderTileVitals(p.tile, v);
}

// Host only: compact scan HUD on a consenting participant's tile, fed by the
// live readings they send to the host. The participant never sees it.
function renderHostScan(id) {
  const p = state.peers.get(id);
  if (!p) return;
  const consented = state.isHost && state.dashboard?.getMember(id)?.consent === 'granted';
  if (!consented) {
    if (p.scan) { p.scan.destroy(); p.scan = null; }
    return;
  }
  if (!p.scan) p.scan = new ScanOverlay(p.tile.root, { compact: true });
  const fresh = p.live && Date.now() - p.liveAt < 3000;
  p.scan.update({ measuring: !!(fresh && p.live.measuring), simulated: !!p.live?.simulated, my: fresh ? p.live : null });
}

function sanitizeLive(m) {
  const f = m.face || {};
  return {
    measuring: !!m.measuring, simulated: !!m.simulated, elapsed: num(m.elapsed) ?? 0,
    pulse: num(m.pulse), breathing: num(m.breathing), hrv: num(m.hrv),
    face: { present: f.present !== false, forward: !!f.forward, talking: !!f.talking },
  };
}

function onPeerData(id, msg) {
  const p = state.peers.get(id);
  if (!p || !msg) return;
  if (msg.type === 'live' && state.isHost) {
    p.live = sanitizeLive(msg);
    p.liveAt = Date.now();
    renderHostScan(id);
  } else if (msg.type === 'state') {
    p.last = msg;
    renderPeer(id);
  } else if (msg.type === 'consent' && state.isHost) {
    state.dashboard?.setConsent(id, String(msg.status));
    renderHostScan(id);
    log(`${p.name}: report consent ${msg.status}`);
  } else if (msg.type === 'report' && state.isHost) {
    state.dashboard?.addReport(id, msg);
    if (state.dashboard?.getMember(id)?.consent === 'granted') state.aiPanel?.feed(msg);
    const f = msg.face;
    const faceText = f ? `, facing ${fmt(f.facingPct)}%, talking ${fmt(f.talkingPct)}%, blinks ${fmt(f.blinksPerMin)}/min${f.expressions ? `, mostly ${topExpression(f)}` : ', no expressions'}` : ', no face data';
    log(`Report from ${p.name}: pulse ${fmt(msg.pulse?.avg)}, breathing ${fmt(msg.breathing?.avg)}, HRV ${fmt(msg.hrv)}, quality ${fmt(msg.quality)}%${faceText}${msg.simulated ? ' (simulated)' : ''}`);
  }
}

// Sent to everyone once per second. Vitals included ONLY while sharing is on.
function stateMessage() {
  const v = state.sharing && state.my ? {
    pulse: state.my.pulse, pulseStable: state.my.pulseStable,
    breathing: state.my.breathing, breathingStable: state.my.breathingStable,
    hrv: state.my.hrv, hrvStable: state.my.hrvStable, simulated: !!state.my.simulated,
  } : null;
  return {
    type: 'state', measuring: state.measuring, sharing: state.sharing,
    reportingToHost: reportingToHost(), vitals: v,
  };
}

function broadcastState() {
  state.meeting?.broadcast(stateMessage());
  // Consented participants also send live readings to the host only.
  if (reportingToHost()) {
    const m = state.my;
    state.meeting.sendTo(hostId(), {
      type: 'live', measuring: state.measuring, simulated: state.simulatedActive,
      elapsed: m?.elapsed ?? 0, pulse: m?.pulse ?? null, breathing: m?.breathing ?? null, hrv: m?.hrv ?? null,
      face: m?.face ? { present: m.face.present, forward: m.face.forward, talking: m.face.talking } : null,
    });
  }
  // Host: expire scans of participants whose live feed stopped.
  if (state.isHost) for (const id of state.peers.keys()) renderHostScan(id);
}

// --- Host reports (participant side) -----------------------------------------

function sendConsent() {
  if (!hasRemoteHost() || !state.consent) return;
  state.meeting.sendTo(hostId(), { type: 'consent', status: state.consent });
}

function showConsentModal() {
  const host = state.peers.get(hostId());
  els.consentHost.textContent = host ? host.name : 'The host';
  els.consentModal.hidden = false;
  els.btnConsentYes.focus();
}

async function grantConsent() {
  els.consentModal.hidden = true;
  state.consent = 'granted';
  sendConsent();
  log('You agreed to send wellness reports to the host.');
  if (!state.measuring && !state.vitals) await startMeasuring();
  startReporting();
  updateToolbar();
  renderSelf();
  broadcastState();
}

function declineConsent() {
  els.consentModal.hidden = true;
  state.consent = 'declined';
  sendConsent();
  log('You declined to send reports to the host.');
  updateToolbar();
}

function revokeConsent() {
  state.consent = 'revoked';
  stopReporting();
  sendConsent();
  log('Stopped sending reports to the host.');
  updateToolbar();
  renderSelf();
  broadcastState();
}

function startReporting() {
  stopReporting();
  state.reportBuilder.reset();
  state.reportTimer = setInterval(() => {
    if (!reportingToHost()) return;
    const report = state.reportBuilder.build({ measuring: state.measuring, simulated: state.simulatedActive });
    state.meeting.sendTo(hostId(), report);
  }, REPORT_INTERVAL_MS);
}

function stopReporting() {
  clearInterval(state.reportTimer);
  state.reportTimer = null;
}

function onHostChanged(id) {
  if (!id) {
    if (state.consent === 'granted') log('The host left: reports stopped.');
    stopReporting();
    state.consent = null;
    els.consentModal.hidden = true;
  } else if (!state.isHost && state.consent == null) {
    // A host joined after us; the prompt shows once their data channel opens.
    state.consent = 'pending';
  }
  for (const pid of state.peers.keys()) renderPeer(pid);
  updateToolbar();
  renderSelf();
}

// --- Host dashboard ----------------------------------------------------------

function exportCsv() {
  if (!state.dashboard || !state.dashboard.reportCount) { log('No reports to export yet.'); return; }
  const blob = new Blob([state.dashboard.toCsv()], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wellness-reports-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// --- Scan HUD --------------------------------------------------------------

function renderScans() {
  const s = { measuring: state.measuring, simulated: state.simulatedActive, my: state.my };
  state.lobbyScan?.update(s);
  els.btnScan.textContent = state.measuring ? '■ Stop scan' : '◎ Start scan';
  els.btnScan.classList.toggle('on', state.measuring);
}

function safeName(s) { return String(s).replace(/[^a-z0-9-_]+/gi, '-').slice(0, 40) || 'participant'; }
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

function downloadCard(id) {
  const m = state.dashboard?.getMember(id);
  if (!m) return;
  const md = `# Wellness report card

${reportCardMarkdown(m, state.briefer?.history(id) || [])}`;
  downloadText(`report-${safeName(m.name)}-${stamp()}.md`, md);
}

function downloadAllCards() {
  if (!state.dashboard) return;
  downloadText(`report-cards-${safeName(els.room.value)}-${stamp()}.md`,
    allReportsMarkdown(state.dashboard.list(), state.briefer, els.room.value.toLowerCase()));
}

// --- Vitals ----------------------------------------------------------------

function setStatus(text, cls = '') {
  els.status.textContent = text;
  els.status.className = `status ${cls}`;
}

function renderMyVitals(m) {
  const show = (el, value, stable, warmupSecs) => {
    if (value == null) {
      const left = Math.max(0, Math.ceil(warmupSecs - (m?.elapsed ?? 0)));
      el.textContent = '';
      const w = document.createElement('span');
      w.className = 'warm';
      w.textContent = m ? `warming up${left ? ` ~${left}s` : '…'}` : '—';
      el.appendChild(w);
      el.className = 'value';
      return;
    }
    el.textContent = fmt(value);
    el.className = 'value' + (stable ? '' : ' dim');
  };
  show(els.vPulse, m?.pulse, m?.pulseStable, WARMUP.pulse);
  show(els.vBreath, m?.breathing, m?.breathingStable, WARMUP.breathing);
  show(els.vHrv, m?.hrv, m?.hrvStable, WARMUP.hrv);
}

async function startMeasuring() {
  const simulated = els.simulated.checked;
  const apiKey = els.apiKey.value.trim();
  if (!simulated) {
    if (!apiKey) { els.settings.hidden = false; log('Set your SmartSpectra API key in Settings first.'); return; }
    if (state.placeholder) { log('Real vitals need a camera (or enable Simulated vitals in Settings).'); return; }
    if (!state.camStream.getVideoTracks()[0].enabled) { log('Turn your camera on to measure vitals.'); return; }
  }

  els.btnMeasure.disabled = true;
  els.btnMeasure.textContent = 'Starting…';
  setStatus('Starting', 'starting');
  els.hint.textContent = simulated
    ? 'Simulated vitals: values are generated, not measured.'
    : 'Starting the SDK… sit still, face the camera, good light on your face.';
  els.hint.className = 'hint-box';

  const callbacks = {
    apiKey,
    log,
    onStatus: (name) => setStatus(`Vitals: ${name}`, name.toLowerCase().split(' ')[0]),
    onHint: (name, hint, ok) => {
      els.hint.textContent = hint || name;
      els.hint.className = 'hint-box ' + (ok ? 'ok' : 'warn');
    },
    onUpdate: (m) => {
      state.my = m;
      state.reportBuilder.add(m);
      renderMyVitals(m);
      renderSelf();
      renderScans();
    },
    onError: (code, message) => log(`Vitals error ${code}: ${message}`),
    onStopped: () => {
      state.vitals = null;
      state.measuring = false;
      state.simulatedActive = false;
      state.sharing = false;
      state.my = null;
      renderMyVitals(null);
      setStatus('Vitals off');
      updateToolbar();
      renderSelf();
      renderScans();
      broadcastState();
    },
  };
  const v = simulated ? new SimulatedVitals(callbacks) : new VitalsMonitor(callbacks);
  state.vitals = v;
  try {
    await v.start(state.camStream);
    if (state.vitals === v) {
      state.measuring = true;
      state.simulatedActive = simulated;
      log(simulated ? 'Measuring (SIMULATED data).' : 'Measuring with the SmartSpectra SDK.');
    }
  } catch (e) {
    log(`Could not start vitals: ${e.code ?? ''} ${e.message}`);
    state.vitals = null;
    setStatus('Vitals off');
  }
  updateToolbar();
  renderSelf();
  renderScans();
  broadcastState();
}

async function stopMeasuring() {
  if (state.vitals) await state.vitals.stop();
}

// --- Toolbar ---------------------------------------------------------------

function setTool(btn, on, onText, offText) {
  btn.classList.toggle('on', on);
  btn.textContent = on ? onText : offText;
}

function updateToolbar() {
  const camOn = !!state.camStream?.getVideoTracks()[0]?.enabled;
  setTool(els.btnMic, !!state.mic?.enabled, 'Mic on', state.mic ? 'Mic off' : 'No mic');
  els.btnMic.disabled = !state.mic;
  els.btnMic.classList.toggle('off', !!state.mic && !state.mic.enabled);
  setTool(els.btnCam, camOn, 'Camera on', 'Camera off');
  els.btnCam.classList.toggle('off', !camOn);
  els.btnMeasure.disabled = false;
  setTool(els.btnMeasure, state.measuring, 'Measuring ✓', 'Measure vitals');
  els.btnShare.disabled = !state.measuring;
  setTool(els.btnShare, state.sharing, 'Sharing ✓', 'Share vitals');
  els.btnHostReport.hidden = !hasRemoteHost();
  setTool(els.btnHostReport, reportingToHost(), 'Reporting to host ✓', 'Report to host');
}

// --- Join / leave ----------------------------------------------------------

function setLobbyControls(enabled) {
  for (const el of [els.camera, els.resolution, els.lockExposure]) el.disabled = !enabled;
}

async function join() {
  const name = els.name.value.trim();
  const room = els.room.value.trim();
  const serverUrl = els.serverUrl.value.trim() || __DEFAULT_SERVER_URL__;
  if (!name) { els.lobbyMsg.textContent = 'Enter your name.'; els.name.focus(); return; }
  if (!room) { els.lobbyMsg.textContent = 'Enter a room code.'; els.room.focus(); return; }
  store.set('name', name);
  store.set('room', room);
  store.set('asHost', els.asHost.checked ? '1' : '0');

  els.btnJoin.disabled = true;
  els.lobbyMsg.textContent = 'Connecting…';
  state.mic = NO_AUDIO ? null : await openMic(log);
  if (NO_AUDIO) log('Test instance: audio disabled to avoid echo on the same laptop.');
  const localStream = new MediaStream([
    ...state.camStream.getVideoTracks(),
    ...(state.mic ? [state.mic] : []),
  ]);

  els.grid.textContent = '';
  state.self = createTile(name, true);
  attachVideo(state.self.video, state.camStream);

  const meeting = new Meeting({
    serverUrl, room, name, localStream, log, host: els.asHost.checked,
    onPeerJoined: addPeer,
    onPeerLeft: removePeer,
    onPeerStream: (id, s) => { const p = state.peers.get(id); if (p) attachVideo(p.tile.video, s); },
    onPeerData,
    onChannelOpen: (id) => {
      meeting.sendTo(id, stateMessage());
      if (id === meeting.hostId && !state.isHost) {
        sendConsent();
        if (state.consent === 'pending') {
          if (AUTO_CONSENT) grantConsent(); else showConsentModal();
        }
      }
    },
    onHostChanged,
    onDisconnected: () => log('Lost connection to the meeting server (existing calls may continue).'),
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
    if (state.mic) { state.mic.stop(); state.mic = null; }
    for (const p of state.peers.values()) p.tile.root.remove();
    state.peers.clear();
    return;
  }

  state.joined = true;
  state.isHost = meeting.hostId === meeting.id;
  if (els.asHost.checked && !state.isHost) log('This room already has a host: you joined as a participant.');

  if (state.isHost) {
    state.dashboard = new HostDashboard(els.hostCards, {
      onOpen: (id) => state.reportModal.open(id),
      onChange: (id) => state.reportModal.refresh(id),
      onDownload: downloadCard,
      getBrief: (id) => state.briefer?.latest(id) || null,
    });
    state.briefer = new AIBriefer({
      getMembers: () => state.dashboard?.list() || [],
      getConfig: () => ({ provider: els.aiProvider.value, apiKey: els.geminiKey.value.trim() }),
      onUpdate: (ids) => {
        state.dashboard?.render();
        for (const id of ids) state.reportModal.refresh(id);
        log(`AI briefs updated for ${ids.map((id) => state.dashboard?.getMember(id)?.name).filter(Boolean).join(', ')}`);
      },
      onStatus: () => state.aiPanel?.render(),
      log,
    });
    state.aiPanel = new HostAIPanel(els.hostAi, {
      briefer: state.briefer,
      getProvider: () => els.aiProvider.value,
      onDownloadAll: downloadAllCards,
    });
    for (const [id, p] of state.peers) state.dashboard.addMember(id, p.name);
    els.hostPanel.hidden = false;
    els.meeting.classList.add('is-host');
    log('You are the host. Participants will be asked to consent to sending you reports.');
  } else if (meeting.hostId) {
    // Consent prompt appears once the data channel to the host is open.
    state.consent = 'pending';
  }

  els.lobbyMsg.textContent = '';
  els.lobby.hidden = true;
  els.meeting.hidden = false;
  els.roomLabel.textContent = `Room: ${room.toLowerCase()}${state.isHost ? ' · You are the host' : ''}`;
  els.roomLabel.hidden = false;
  setLobbyControls(false);
  watchFps(state.self.video);
  updateToolbar();
  renderMyVitals(state.my);
  renderSelf();
  renderScans();
  for (const id of state.peers.keys()) renderPeer(id);
  state.broadcastTimer = setInterval(broadcastState, 1000);
  log(`Joined room "${room.toLowerCase()}" as ${name}`);
}

async function leave() {
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
  if (state.dashboard) { state.dashboard.destroy(); state.dashboard = null; }
  state.isHost = false;
  els.hostPanel.hidden = true;
  els.meeting.classList.remove('is-host');
  for (const p of state.peers.values()) p.tile.root.remove();
  state.peers.clear();
  state.self?.root.remove();
  state.self = null;
  state.reportModal?.close();
  if (state.mic) { state.mic.stop(); state.mic = null; }
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

// --- Wiring ----------------------------------------------------------------

els.btnSettings.addEventListener('click', () => { els.settings.hidden = !els.settings.hidden; });
els.geminiKey.addEventListener('change', saveSettings);
els.btnShowKey.addEventListener('click', () => {
  const show = els.apiKey.type === 'password';
  els.apiKey.type = show ? 'text' : 'password';
  els.btnShowKey.textContent = show ? 'Hide' : 'Show';
});
els.btnSaveSettings.addEventListener('click', () => { saveSettings(); els.settings.hidden = true; });
els.apiKey.addEventListener('input', updateKeyStatus);
els.simulated.addEventListener('change', () => {
  saveSettings();
  if (state.measuring) log('Simulation setting applies the next time you start measuring.');
});
els.screenLight.addEventListener('change', () => {
  applyScreenLight();
  store.set('screenLight', els.screenLight.checked ? '1' : '0');
});
for (const el of [els.camera, els.resolution, els.lockExposure]) {
  el.addEventListener('change', () => { saveSettings(); if (!state.joined) startCamera(); });
}

els.aiProvider.addEventListener('change', () => {
  saveSettings();
  if (state.reportModal?.id != null) state.reportModal.open(state.reportModal.id);
  state.aiPanel?.render();
});
els.btnScan.addEventListener('click', () => (state.measuring || state.vitals ? stopMeasuring() : startMeasuring()));
els.btnNewRoom.addEventListener('click', () => { els.room.value = randomRoom(); });
els.btnJoin.addEventListener('click', join);
els.room.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
els.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

els.btnMic.addEventListener('click', () => {
  if (!state.mic) return;
  state.mic.enabled = !state.mic.enabled;
  updateToolbar();
});
els.btnCam.addEventListener('click', async () => {
  const track = state.camStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  if (!track.enabled && state.measuring && !state.simulatedActive) {
    log('Camera off: vitals stopped.');
    await stopMeasuring();
  }
  updateToolbar();
});
els.btnMeasure.addEventListener('click', () => (state.measuring || state.vitals ? stopMeasuring() : startMeasuring()));
els.btnShare.addEventListener('click', () => {
  if (!state.measuring) return;
  state.sharing = !state.sharing;
  log(state.sharing ? 'Sharing your live vitals with this room.' : 'Stopped sharing vitals.');
  updateToolbar();
  renderSelf();
  broadcastState();
});
els.btnHostReport.addEventListener('click', () => (reportingToHost() ? revokeConsent() : grantConsent()));
els.btnConsentYes.addEventListener('click', grantConsent);
els.btnConsentNo.addEventListener('click', declineConsent);
els.btnExport.addEventListener('click', exportCsv);
els.btnLeave.addEventListener('click', leave);

// Called by the main process before the window closes.
window.__shutdown = async () => {
  const wasMeasuring = !!state.vitals && !state.simulatedActive;
  stopReporting();
  state.briefer?.destroy();
  await stopMeasuring();
  state.meeting?.leave();
  stopCamera();
  if (state.mic) state.mic.stop();
  return { wasMeasuring };
};

// --- Boot ------------------------------------------------------------------

(async () => {
  loadSettings();
  state.lobbyScan = new ScanOverlay(els.previewWrap);
  state.reportModal = new ReportModal(els.reportModal, {
    getMember: (id) => state.dashboard?.getMember(id) || null,
    getProvider: () => els.aiProvider.value,
    getBriefer: () => state.briefer,
  });
  renderScans();
  if (!els.apiKey.value && !els.simulated.checked) els.settings.hidden = false;
  await populateCameras();
  await startCamera();

  // Optional auto-join for testing: MEET_AUTOJOIN="room:name" or "room:name:host"
  const auto = new URLSearchParams(location.search).get('autojoin');
  if (auto && auto.includes(':')) {
    const [room, name, role] = auto.split(':');
    els.room.value = room;
    els.name.value = name;
    els.asHost.checked = role === 'host';
    join();
  }
})();
