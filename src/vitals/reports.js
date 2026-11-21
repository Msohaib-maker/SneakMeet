import { movementShare } from './extra.js';

export const REPORT_INTERVAL_MS = 25000;

const round1 = (n) => Math.round(n * 10) / 10;

export class ReportBuilder {
  constructor() { this.reset(); }

  reset() {
    this.samples = [];
    this.lastSampleAt = 0;
    this.prev = null;
    this.lastBlinks = null;
  }

  add(v) {
    const now = Date.now();
    if (now - this.lastSampleAt < 1000) return;
    this.lastSampleAt = now;
    this.samples.push(v);
  }

  build({ measuring, simulated }) {
    const s = this.samples;
    this.samples = [];
    const stats = (key) => {
      const vals = s.map((x) => x[key]).filter(Number.isFinite);
      if (!vals.length) return null;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return { avg: round1(avg), min: round1(Math.min(...vals)), max: round1(Math.max(...vals)) };
    };
    const pulse = stats('pulse');
    const breathing = stats('breathing');
    const hrvVals = s.map((x) => x.hrv).filter(Number.isFinite);
    const stable = s.filter((x) => x.pulseStable && x.breathingStable).length;
    const delta = (cur, key) => (cur && this.prev?.[key] ? round1(cur.avg - this.prev[key].avg) : null);

    const report = {
      face: this._face(s),
      type: 'report',
      at: Date.now(),
      windowSec: REPORT_INTERVAL_MS / 1000,
      measuring: !!measuring,
      simulated: !!simulated,
      samples: s.length,
      pulse,
      breathing,
      hrv: hrvVals.length ? round1(hrvVals[hrvVals.length - 1]) : null,
      quality: s.length ? Math.round((100 * stable) / s.length) : 0,
      trend: { pulse: delta(pulse, 'pulse'), breathing: delta(breathing, 'breathing') },
      ...this._extra(s),
    };
    if (pulse || breathing) this.prev = report;
    return report;
  }

  _extra(s) {
    const x = s.length ? s[s.length - 1].extra : null;
    if (!x) return { heart: null, breathStyle: null };
    const r = (n) => (Number.isFinite(n) ? Math.round(n) : null);
    const heart = x.meanNn ? { beatGapMs: r(x.meanNn), sdnnMs: r(x.sdnn), stressIndex: r(x.baevsky), confident: !!x.hrvOk } : null;
    const share = x.breathOk ? movementShare(x) : null;
    const breathStyle = share == null ? null : share > 0.55 ? 'belly' : share < 0.4 ? 'chest' : 'mixed';
    return { heart, breathStyle };
  }

  _face(s) {
    const faces = s.map((x) => x.face).filter(Boolean);
    if (!faces.length) return null;
    const pct = (fn) => Math.round((100 * faces.filter(fn).length) / faces.length);
    const blinks = faces[faces.length - 1].blinks;
    const prevBlinks = this.lastBlinks ?? faces[0].blinks;
    this.lastBlinks = blinks;
    const withEx = faces.filter((f) => f.expressions);
    let expressions = null;
    if (withEx.length) {
      expressions = {};
      for (const f of withEx) {
        for (const [k, v] of Object.entries(f.expressions)) expressions[k] = (expressions[k] || 0) + v / withEx.length;
      }
      for (const k of Object.keys(expressions)) expressions[k] = Math.round(expressions[k]);
    }
    return {
      presentPct: pct((f) => f.present),
      facingPct: pct((f) => f.forward),
      talkingPct: pct((f) => f.talking),
      blinksPerMin: Math.round((Math.max(0, blinks - prevBlinks) * 60) / faces.length),
      expressions,
    };
  }
}
