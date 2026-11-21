import { els } from "./dom.js";
import { randomRoom, store } from "./state.js";
import { applyPersona, getPersona } from "../ui/persona.js";
import { setVoiceOn, voiceOn } from "../ui/voice.js";
import { setServerUrl } from "../ai/server.js";

export function loadSettings() {
  els.apiKey.value = store.get("apiKey", __DEFAULT_API_KEY__);
  els.serverUrl.value = store.get("serverUrl", "") || __DEFAULT_SERVER_URL__;
  els.resolution.value = store.get("resolution", "640x480");
  els.lockExposure.checked = store.get("lockExposure", "1") === "1";
  els.screenLight.checked = store.get("screenLight", "0") === "1";
  const simParam = new URLSearchParams(location.search).get("simulated");
  els.simulated.checked = simParam
    ? simParam === "1"
    : store.get("simulated", "0") === "1";
  els.echoGate.checked = store.get("echoGate", "1") === "1";
  els.selfScan.checked = store.get("selfScan", "1") === "1";
  els.geminiKey.value = store.get("geminiKey", __DEFAULT_GEMINI_KEY__);
  els.aiProvider.value = store.get("aiProvider", "gemini");
  if (!els.aiProvider.value) els.aiProvider.value = "preview";
  els.asHost.checked = store.get("asHost", "0") === "1";
  els.name.value = store.get("name", "");
  els.room.value = store.get("room", "") || randomRoom();
  els.practiceScenario.value = store.get("practiceScenario", "interview");
  if (!els.practiceScenario.value) els.practiceScenario.value = "interview";
  els.practiceInstructions.value = store.get("practiceInstructions", "");
  const personaParam = new URLSearchParams(location.search).get("persona");
  els.botPersona.value = personaParam || getPersona();
  applyPersona(els.botPersona.value);
  els.showBot.checked = store.get("showBot", "1") === "1";
  els.botVoice.checked = voiceOn();
  renderVoiceButtons();
  setServerUrl(els.serverUrl.value || __DEFAULT_SERVER_URL__);
  applyScreenLight();
  updateKeyStatus();
}

export function renderVoiceButtons() {
  const on = els.botVoice.checked;
  els.btnPVoice.textContent = on ? "🔊 Voice on" : "🔇 Voice off";
  els.btnPVoice.classList.toggle("on", on);
  els.btnBotVoice.textContent = on ? "🔊" : "🔇";
}

export function toggleVoice(on = !els.botVoice.checked) {
  els.botVoice.checked = on;
  setVoiceOn(on);
  renderVoiceButtons();
}

export function saveSettings() {
  store.set("apiKey", els.apiKey.value.trim());
  store.set("serverUrl", els.serverUrl.value.trim());
  store.set("resolution", els.resolution.value);
  store.set("lockExposure", els.lockExposure.checked ? "1" : "0");
  store.set("simulated", els.simulated.checked ? "1" : "0");
  store.set("aiProvider", els.aiProvider.value);
  store.set("geminiKey", els.geminiKey.value.trim());
  store.set("camera", els.camera.value);
  store.set("echoGate", els.echoGate.checked ? "1" : "0");
  store.set("selfScan", els.selfScan.checked ? "1" : "0");
  store.set("showBot", els.showBot.checked ? "1" : "0");
  setServerUrl(els.serverUrl.value.trim() || __DEFAULT_SERVER_URL__);
  updateKeyStatus();
}

export function updateKeyStatus() {
  const k = els.apiKey.value.trim();
  const sim = els.simulated.checked;
  for (const r of els.modeRadios)
    r.checked = r.value === (sim ? "sim" : "real");
  let text, cls;
  if (sim) {
    text = "Simulated mode: demo numbers only, no SDK credits used.";
    cls = "warn";
  } else if (k) {
    text = `✓ Real readings ready (key …${k.slice(-4)}). Press Measure or Start scan.`;
    cls = "ok";
  } else {
    text = "✓ Real readings ready (using the BetterZoom server's key). Press Measure or Start scan.";
    cls = "ok";
  }
  els.keyStatus.textContent = text;
  els.keyStatus.className = `key-status ${cls}`;
  const needKey = false;
  els.modeChip.textContent = sim
    ? "Vitals: SIMULATED · change"
    : needKey
      ? "Vitals: key needed · set up"
      : "Vitals: REAL (SDK)";
  els.modeChip.className = `mode-chip ${sim || needKey ? "sim" : "real"}`;
  const vitalsTab = els.settingsTabs.find((t) => t.dataset.tab === "vitals");
  vitalsTab.querySelector(".dot")?.remove();
  if (needKey)
    vitalsTab.insertAdjacentHTML(
      "beforeend",
      '<span class="dot" title="Needs attention"></span>',
    );
}

export function showSettingsTab(tab) {
  for (const t of els.settingsTabs)
    t.classList.toggle("active", t.dataset.tab === tab);
  for (const p of els.settingsPanes) p.hidden = p.dataset.pane !== tab;
}

export function openSettings(tab = "vitals") {
  showSettingsTab(tab);
  els.settings.hidden = false;
  els.btnCloseSettings.focus();
}

export function closeSettings() {
  saveSettings();
  els.settings.hidden = true;
}

export function applyScreenLight() {
  document.body.classList.toggle("screen-light", els.screenLight.checked);
}
