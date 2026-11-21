import { els } from "./dom.js";
import { log, state, store } from "./state.js";
import { ScanOverlay } from "../ui/scan.js";
import { renderScans, updatePracticeToolbar } from "./toolbar.js";
import { SCENARIOS } from "../ai/coach-ai.js";
import { PracticeSession } from "../practice/session.js";
import { attachVideo, setLobbyControls, watchFps } from "./devices.js";
import { startMeasuring, stopMeasuring } from "./measure.js";
import { renderSummary } from "./practice-summary.js";
import { makeBodyBot } from "../ui/bot-body.js";
import { stopSpeaking } from "../ui/voice.js";

export function renderPracticeScan() {
  const on = els.selfScan.checked && !!state.practice && !state.realVitals;
  if (on && !state.practiceScan)
    state.practiceScan = new ScanOverlay(els.practiceTile, { ambient: true });
  if (!on && state.practiceScan) {
    state.practiceScan.destroy();
    state.practiceScan = null;
  }
  updatePracticeToolbar();
}

export async function startPractice() {
  if (state.practice || state.joined) return;
  const scenario =
    els.practiceScenario.value in SCENARIOS
      ? els.practiceScenario.value
      : "custom";
  const instructions = els.practiceInstructions.value.trim();
  store.set("practiceScenario", scenario);
  store.set("practiceInstructions", instructions);

  els.psModal.hidden = true;
  els.pBot.replaceChildren(makeBodyBot());
  els.pMore.open = store.get("pMoreOpen", "1") === "1";
  state.practice = new PracticeSession({
    ui: {
      chip: els.pChip,
      timeline: els.pTimeline,
      timer: els.pTimer,
      gauge: els.pGauge,
      coach: els.pCoach,
      expr: els.pExpr,
      vitals: els.pVitals,
      face: els.pFace,
      credits: els.pCredits,
      coachStatus: els.pCoachStatus,
      bot: els.pBot.firstChild,
      bubble: els.pBubble,
      details: {
        root: els.pMore,
        breath: els.pWaveBreath,
        pulse: els.pWavePulse,
        breathNote: els.pBreathNote,
        pulseNote: els.pPulseNote,
        hrv: els.pHrvMore,
        hrvNote: els.pHrvNote,
      },
    },
    scenario,
    instructions,
    getProvider: () => els.aiProvider.value,
    getApiKey: () => els.geminiKey.value.trim(),
    log,
  });
  const name = els.name.value.trim();
  els.practiceTitle.textContent = name
    ? `${name} · practice`
    : "You · practice";
  els.pScenario.textContent = SCENARIOS[scenario].label;
  els.pHint.textContent =
    "Starting readings… sit still, face the camera, good light on your face.";
  els.pHint.className = "hint-box";
  els.lobby.hidden = true;
  els.practice.hidden = false;
  els.roomLabel.textContent = "Self mode · practice";
  els.roomLabel.hidden = false;
  setLobbyControls(false);
  attachVideo(els.practiceVideo, state.camStream);
  watchFps(els.practiceVideo);
  renderPracticeScan();
  log(
    `Practice started: ${SCENARIOS[scenario].label}${els.aiProvider.value === "gemini" ? " (Gemini coach)" : ""}.`,
  );
  if (!state.measuring && !state.vitals) await startMeasuring();
  if (state.simulatedActive) {
    els.pHint.textContent =
      "SIMULATED readings: demo numbers, not measured from your camera. Switch to Real in ⚙ Vitals.";
    els.pHint.className = "hint-box warn";
  }
  updatePracticeToolbar();
}

export async function endPractice() {
  const p = state.practice;
  if (!p) return;
  els.btnPEnd.disabled = true;
  await stopMeasuring();
  els.psBody.textContent = "Writing your debrief…";
  els.psModal.hidden = false;
  const sum = await p.finish();
  renderSummary(sum, p);
  els.btnPEnd.disabled = false;
}

export function closePractice() {
  stopSpeaking();
  state.practice?.destroy();
  state.practice = null;
  els.psModal.hidden = true;
  state.practiceScan?.destroy();
  state.practiceScan = null;
  els.practiceVideo.srcObject = null;
  els.practice.hidden = true;
  els.lobby.hidden = false;
  els.roomLabel.hidden = true;
  setLobbyControls(true);
  const camTrack = state.camStream?.getVideoTracks()[0];
  if (camTrack) camTrack.enabled = true;
  watchFps(els.preview);
  renderScans();
}
