import { toggleVoice } from "./settings.js";
import { els } from "./dom.js";
import { closePractice, endPractice, renderPracticeScan, startPractice } from "./practice.js";
import { log, state, store } from "./state.js";
import { saveSettings } from "./settings.js";
import { startMeasuring, stopMeasuring } from "./measure.js";
import { updatePracticeToolbar } from "./toolbar.js";

els.btnPractice.addEventListener("click", startPractice);
els.practiceScenario.addEventListener("change", () =>
  store.set("practiceScenario", els.practiceScenario.value),
);
els.practiceInstructions.addEventListener("change", () =>
  store.set("practiceInstructions", els.practiceInstructions.value.trim()),
);
els.btnPCoach.addEventListener("click", () => state.practice?.coachNow());
els.btnPRecal.addEventListener("click", () => state.practice?.recalibrate());
els.btnPScan.addEventListener("click", () => {
  els.selfScan.checked = !els.selfScan.checked;
  saveSettings();
  renderPracticeScan();
});
els.btnPMeasure.addEventListener("click", async () => {
  if (state.measuring || state.vitals) await stopMeasuring();
  else await startMeasuring();
  updatePracticeToolbar();
});
els.btnPCam.addEventListener("click", async () => {
  const track = state.camStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  if (!track.enabled && state.measuring && !state.simulatedActive) {
    log("Camera off: readings stopped.");
    await stopMeasuring();
  }
  updatePracticeToolbar();
});
els.btnPEnd.addEventListener("click", endPractice);
els.btnPVoice.addEventListener("click", () => toggleVoice());
els.pMore.addEventListener("toggle", () => store.set("pMoreOpen", els.pMore.open ? "1" : "0"));
els.btnPsDownload.addEventListener("click", () => state.practice?.download());
els.btnPsClose.addEventListener("click", closePractice);
els.btnPsAgain.addEventListener("click", async () => {
  closePractice();
  await startPractice();
});
