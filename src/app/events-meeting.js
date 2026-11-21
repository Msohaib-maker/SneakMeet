import { els } from "./dom.js";
import { log, randomRoom, reportingToHost, state } from "./state.js";
import { startMeasuring, stopMeasuring } from "./measure.js";
import { join } from "./join.js";
import { updateToolbar } from "./toolbar.js";
import { renderSelf } from "./tiles.js";
import { broadcastState } from "./broadcast.js";
import { grantConsent, revokeConsent } from "./consent.js";
import { exportCsv } from "./downloads.js";
import { leave } from "./leave.js";

els.btnScan.addEventListener("click", () =>
  state.measuring || state.vitals ? stopMeasuring() : startMeasuring(),
);
els.btnNewRoom.addEventListener("click", () => {
  els.room.value = randomRoom();
});
els.btnJoin.addEventListener("click", join);
els.room.addEventListener("keydown", (e) => {
  if (e.key === "Enter") join();
});
els.name.addEventListener("keydown", (e) => {
  if (e.key === "Enter") join();
});

els.btnMic.addEventListener("click", () => {
  if (!state.mic) return;
  state.mic.enabled = !state.mic.enabled;
  updateToolbar();
});
els.btnCam.addEventListener("click", async () => {
  const track = state.camStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  if (!track.enabled && state.measuring && !state.simulatedActive) {
    log("Camera off: vitals stopped.");
    await stopMeasuring();
  }
  updateToolbar();
});
els.btnMeasure.addEventListener("click", () =>
  state.measuring || state.vitals ? stopMeasuring() : startMeasuring(),
);
els.btnShare.addEventListener("click", () => {
  if (!state.measuring) return;
  state.sharing = !state.sharing;
  log(
    state.sharing
      ? "Sharing your live vitals with this room."
      : "Stopped sharing vitals.",
  );
  updateToolbar();
  renderSelf();
  broadcastState();
});
els.btnHostReport.addEventListener("click", () =>
  reportingToHost() ? revokeConsent() : grantConsent(),
);
els.btnConsentYes.addEventListener("click", grantConsent);
els.btnConsentNo.addEventListener("click", grantConsent);
els.btnExport.addEventListener("click", exportCsv);
els.btnLeave.addEventListener("click", leave);
