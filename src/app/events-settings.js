import { els } from "./dom.js";
import {
  applyScreenLight,
  closeSettings,
  openSettings,
  saveSettings,
  showSettingsTab,
  toggleVoice,
  updateKeyStatus,
} from "./settings.js";
import { log, state, store } from "./state.js";
import { renderSelfScan } from "./tiles.js";
import { startCamera } from "./devices.js";
import { applyPersona } from "../ui/persona.js";
import { hideBotOverlay, renderBotOverlay } from "./bot-overlay.js";

els.btnSettings.addEventListener("click", () =>
  els.settings.hidden ? openSettings() : closeSettings(),
);
els.modeChip.addEventListener("click", () => openSettings("vitals"));
els.btnCloseSettings.addEventListener("click", closeSettings);
els.settings.addEventListener("mousedown", (e) => {
  if (e.target === els.settings) closeSettings();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.settings.hidden) closeSettings();
});
for (const t of els.settingsTabs)
  t.addEventListener("click", () => showSettingsTab(t.dataset.tab));
for (const r of els.modeRadios) {
  r.addEventListener("change", () => {
    els.simulated.checked = r.value === "sim";
    els.simulated.dispatchEvent(new Event("change"));
    if (r.value === "real" && !els.apiKey.value.trim()) els.apiKey.focus();
  });
}
els.geminiKey.addEventListener("change", saveSettings);
let hadKey = !!els.apiKey.value.trim();
els.apiKey.addEventListener("change", () => {
  const hasKey = !!els.apiKey.value.trim();
  if (hasKey && !hadKey && els.simulated.checked) els.simulated.checked = false;
  hadKey = hasKey;
  saveSettings();
});
els.serverUrl.addEventListener("change", saveSettings);
els.echoGate.addEventListener("change", () => {
  saveSettings();
  state.echoGate?.setEnabled(els.echoGate.checked);
});
els.selfScan.addEventListener("change", () => {
  saveSettings();
  renderSelfScan();
});
els.btnSelfScan.addEventListener("click", () => {
  els.selfScan.checked = !els.selfScan.checked;
  saveSettings();
  renderSelfScan();
});
els.btnShowKey.addEventListener("click", () => {
  const show = els.apiKey.type === "password";
  els.apiKey.type = show ? "text" : "password";
  els.btnShowKey.textContent = show ? "Hide" : "Show";
});
els.btnSaveSettings.addEventListener("click", closeSettings);
els.apiKey.addEventListener("input", updateKeyStatus);
els.simulated.addEventListener("change", () => {
  saveSettings();
  if (state.measuring)
    log("Simulation setting applies the next time you start measuring.");
});
els.screenLight.addEventListener("change", () => {
  applyScreenLight();
  store.set("screenLight", els.screenLight.checked ? "1" : "0");
});
for (const el of [els.camera, els.resolution, els.lockExposure]) {
  el.addEventListener("change", () => {
    saveSettings();
    if (!state.joined) startCamera();
  });
}

els.botPersona.addEventListener("change", () => {
  applyPersona(els.botPersona.value);
  state.practice?._renderAll();
  state.dashboard?.render();
  renderBotOverlay();
});
els.showBot.addEventListener("change", () => {
  saveSettings();
  renderBotOverlay();
});
els.btnBotHide.addEventListener("click", hideBotOverlay);
els.botVoice.addEventListener("change", () => toggleVoice(els.botVoice.checked));
els.btnBotVoice.addEventListener("click", () => toggleVoice());

els.aiProvider.addEventListener("change", () => {
  saveSettings();
  if (state.reportModal?.id != null)
    state.reportModal.open(state.reportModal.id);
  state.aiPanel?.render();
});
