import { log, state } from "./state.js";
import { allReportsMarkdown, downloadText, reportCardMarkdown } from "../host/host-ai.js";
import { els } from "./dom.js";

export function exportCsv() {
  if (!state.dashboard || !state.dashboard.reportCount) {
    log("No reports to export yet.");
    return;
  }
  const blob = new Blob([state.dashboard.toCsv()], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `wellness-reports-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function safeName(s) {
  return (
    String(s)
      .replace(/[^a-z0-9-_]+/gi, "-")
      .slice(0, 40) || "participant"
  );
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

export function downloadCard(id) {
  const m = state.dashboard?.getMember(id);
  if (!m) return;
  const md = `# Wellness report card

${reportCardMarkdown(m, state.briefer?.history(id) || [])}`;
  downloadText(`report-${safeName(m.name)}-${stamp()}.md`, md);
}

export function downloadAllCards() {
  if (!state.dashboard) return;
  downloadText(
    `report-cards-${safeName(els.room.value)}-${stamp()}.md`,
    allReportsMarkdown(
      state.dashboard.list(),
      state.briefer,
      els.room.value.toLowerCase(),
    ),
  );
}
