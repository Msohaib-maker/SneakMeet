import { fmt, hostId, log, num, state } from "./state.js";
import { createTile, renderBadges, renderTileVitals } from "./tiles.js";
import { ScanOverlay } from "../ui/scan.js";
import { sanitizeCalm, topExpression } from "../host/dashboard-data.js";

export function addPeer(id, name) {
  if (state.peers.has(id)) return;
  const p = {
    name,
    tile: createTile(name, false),
    last: null,
    live: null,
    liveAt: 0,
    scan: null,
  };
  state.peers.set(id, p);
  renderPeer(id);
  state.dashboard?.addMember(id, name);
  log(`${name} joined`);
}

export function removePeer(id) {
  const p = state.peers.get(id);
  if (!p) return;
  p.tile.root.remove();
  state.echoGate?.removeRemote(p.stream);
  state.peers.delete(id);
  state.dashboard?.memberLeft(id);
  log(`${p.name} left`);
}

export function renderPeer(id) {
  const p = state.peers.get(id);
  if (!p) return;
  const m = p.last || {};
  renderBadges(p.tile, {
    isHost: id === hostId(),
    measuring: !!m.measuring,
    sharing: !!m.sharing,
    reporting: !!m.reportingToHost,
  });
  const v =
    m.sharing && m.vitals
      ? {
          pulse: num(m.vitals.pulse),
          pulseStable: !!m.vitals.pulseStable,
          breathing: num(m.vitals.breathing),
          breathingStable: !!m.vitals.breathingStable,
          hrv: num(m.vitals.hrv),
          hrvStable: !!m.vitals.hrvStable,
          simulated: !!m.vitals.simulated,
        }
      : null;
  renderTileVitals(p.tile, v);
}

export function renderHostScan(id) {
  const p = state.peers.get(id);
  if (!p) return;
  const consented =
    state.isHost && state.dashboard?.getMember(id)?.consent === "granted";
  if (!consented) {
    if (p.scan) {
      p.scan.destroy();
      p.scan = null;
    }
    return;
  }
  if (!p.scan) p.scan = new ScanOverlay(p.tile.root, { compact: true });
  const fresh = p.live && Date.now() - p.liveAt < 3000;
  p.scan.update({
    measuring: !!(fresh && p.live.measuring),
    simulated: !!p.live?.simulated,
    my: fresh ? p.live : null,
    calm: fresh ? p.live.calm : null,
  });
}

function sanitizeLive(m) {
  const f = m.face || {};
  return {
    measuring: !!m.measuring,
    simulated: !!m.simulated,
    elapsed: num(m.elapsed) ?? 0,
    pulse: num(m.pulse),
    breathing: num(m.breathing),
    hrv: num(m.hrv),
    face: {
      present: f.present !== false,
      forward: !!f.forward,
      talking: !!f.talking,
    },
    calm: sanitizeCalm(m.calm),
  };
}

export function onPeerData(id, msg) {
  const p = state.peers.get(id);
  if (!p || !msg) return;
  if (msg.type === "live" && state.isHost) {
    p.live = sanitizeLive(msg);
    p.liveAt = Date.now();
    state.dashboard?.setLive(id, p.live.calm);
    renderHostScan(id);
  } else if (msg.type === "state") {
    p.last = msg;
    renderPeer(id);
  } else if (msg.type === "consent" && state.isHost) {
    state.dashboard?.setConsent(id, String(msg.status));
    renderHostScan(id);
    log(`${p.name}: report consent ${msg.status}`);
  } else if (msg.type === "report" && state.isHost) {
    state.dashboard?.addReport(id, msg);
    const f = msg.face;
    const faceText = f
      ? `, facing ${fmt(f.facingPct)}%, talking ${fmt(f.talkingPct)}%, blinks ${fmt(f.blinksPerMin)}/min${f.expressions ? `, mostly ${topExpression(f)}` : ", no expressions"}`
      : ", no face data";
    log(
      `Report from ${p.name}: pulse ${fmt(msg.pulse?.avg)}, breathing ${fmt(msg.breathing?.avg)}, HRV ${fmt(msg.hrv)}, quality ${fmt(msg.quality)}%${faceText}${msg.simulated ? " (simulated)" : ""}`,
    );
  }
}
