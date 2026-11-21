import { hostId, reportingToHost, state } from "./state.js";
import { renderHostScan } from "./peers.js";

export function stateMessage() {
  const v =
    state.sharing && state.my
      ? {
          pulse: state.my.pulse,
          pulseStable: state.my.pulseStable,
          breathing: state.my.breathing,
          breathingStable: state.my.breathingStable,
          hrv: state.my.hrv,
          hrvStable: state.my.hrvStable,
          simulated: !!state.my.simulated,
        }
      : null;
  return {
    type: "state",
    measuring: state.measuring,
    sharing: state.sharing,
    reportingToHost: reportingToHost(),
    vitals: v,
  };
}

export function broadcastState() {
  state.meeting?.broadcast(stateMessage());
  if (reportingToHost()) {
    const m = state.my;
    state.meeting.sendTo(hostId(), {
      type: "live",
      measuring: state.measuring,
      simulated: state.simulatedActive,
      elapsed: m?.elapsed ?? 0,
      pulse: m?.pulse ?? null,
      breathing: m?.breathing ?? null,
      hrv: m?.hrv ?? null,
      calm: state.myCalm,
      face: m?.face
        ? {
            present: m.face.present,
            forward: m.face.forward,
            talking: m.face.talking,
          }
        : null,
    });
  }
  if (state.isHost) for (const id of state.peers.keys()) renderHostScan(id);
}
