import { state } from "./state.js";
import { stopReporting } from "./consent.js";
import { stopMeasuring } from "./measure.js";
import { populateCameras, startCamera, stopCamera, stopMic } from "./devices.js";
import { loadSettings, openSettings } from "./settings.js";
import { ScanOverlay } from "../ui/scan.js";
import { els } from "./dom.js";
import { ReportModal } from "../host/report-modal.js";
import { downloadCard } from "./downloads.js";
import { renderScans } from "./toolbar.js";
import { startPractice } from "./practice.js";
import { join } from "./join.js";
import "./events-settings.js";
import "./events-meeting.js";
import "./events-practice.js";

window.__shutdown = async () => {
  const wasMeasuring = !!state.vitals && !state.simulatedActive;
  state.practice?.destroy();
  stopReporting();
  state.briefer?.destroy();
  await stopMeasuring();
  state.meeting?.leave();
  stopCamera();
  stopMic();
  return { wasMeasuring };
};

(async () => {
  loadSettings();
  state.lobbyScan = new ScanOverlay(els.previewWrap);
  state.reportModal = new ReportModal(els.reportModal, {
    getMember: (id) => state.dashboard?.getMember(id) || null,
    getProvider: () => els.aiProvider.value,
    getBriefer: () => state.briefer,
    onDownload: downloadCard,
  });
  renderScans();
  if (!els.apiKey.value && !els.simulated.checked) openSettings("vitals");
  await populateCameras();
  await startCamera();

  if (new URLSearchParams(location.search).get("autopractice") === "1") {
    startPractice();
    return;
  }

  const auto = new URLSearchParams(location.search).get("autojoin");
  if (auto && auto.includes(":")) {
    const [room, name, role] = auto.split(":");
    els.room.value = room;
    els.name.value = name;
    els.asHost.checked = role === "host";
    join();
  }
})();
