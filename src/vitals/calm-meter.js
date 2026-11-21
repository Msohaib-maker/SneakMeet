export const LEVELS = [
  { id: 'calm', label: 'Calm', max: 25, color: 'var(--ok)' },
  { id: 'steady', label: 'Steady', max: 45, color: 'var(--accent)' },
  { id: 'tense', label: 'Tense', max: 65, color: 'var(--warn)' },
  { id: 'anxious', label: 'Anxious', max: 101, color: 'var(--danger)' },
];
export const levelFor = (score) => LEVELS.find((l) => score < l.max) || LEVELS[LEVELS.length - 1];

const TYPICAL = { pulse: 72, breathing: 15 };
const BASELINE_SAMPLES = 15;
const WINDOW_MS = 12000;
const NEGATIVE = ['fear', 'sad', 'angry', 'disgust', 'contempt'];
const MIN_CONF = { pulse: 45, breathing: 40, hrv: 30 };
const PLAUSIBLE = { pulse: [40, 180], breathing: [6, 30] };
const EXPR_BASELINE_SAMPLES = 20;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export class CalmMeter {
  constructor() { this.reset(); }

  reset() {
    this.samples = [];
    this.base = { pulse: [], breathing: [] };
    this.baseline = null;
    this.negBase = [];
    this.smooth = null;
    this.lastAt = 0;
    this.last = null;
  }

  recalibrate() { this.base = { pulse: [], breathing: [] }; this.baseline = null; this.negBase = []; }

  add(m) {
    const now = Date.now();
    if (now - this.lastAt < 1000 && this.last) return this.last;
    this.lastAt = now;
    const ok = (v) => Number.isFinite(v);
    const usable = (key) => {
      const v = m[key], c = m[`${key}Conf`];
      const [lo, hi] = PLAUSIBLE[key];
      return ok(v) && v >= lo && v <= hi && (!ok(c) || c >= MIN_CONF[key]);
    };
    const pulseOk = usable('pulse');
    const breathOk = usable('breathing') && !m.face?.talking;
    const hrvOk = ok(m.hrv) && (!ok(m.hrvConf) || m.hrvConf >= MIN_CONF.hrv);
    this.samples.push({ at: now, pulse: pulseOk ? m.pulse : null, breathing: breathOk ? m.breathing : null,
      hrv: hrvOk ? m.hrv : null, face: m.face || null });
    if (m.face?.expressions && this.negBase.length < EXPR_BASELINE_SAMPLES) {
      this.negBase.push(NEGATIVE.reduce((a, k) => a + (Number(m.face.expressions[k]) || 0), 0));
    }
    while (this.samples.length && now - this.samples[0].at > WINDOW_MS) this.samples.shift();

    if (!this.baseline) {
      if (m.pulseStable && pulseOk) this.base.pulse.push(m.pulse);
      if (m.breathingStable && breathOk) this.base.breathing.push(m.breathing);
      if (this.base.pulse.length >= BASELINE_SAMPLES && (this.base.breathing.length >= 5 || this.base.pulse.length >= 45)) {
        this.baseline = { pulse: median(this.base.pulse), breathing: median(this.base.breathing) };
      }
    }
    this.last = this.estimate();
    return this.last;
  }

  estimate() {
    const s = this.samples;
    const pulse = median(s.map((x) => x.pulse).filter((v) => v != null));
    const breathing = median(s.map((x) => x.breathing).filter((v) => v != null));
    const hrv = s.map((x) => x.hrv).filter((v) => v != null).pop() ?? null;
    const faces = s.map((x) => x.face).filter((f) => f && f.expressions);
    const expressions = faces.length ? averageExpressions(faces.map((f) => f.expressions)) : null;

    const basePulse = this.baseline?.pulse ?? TYPICAL.pulse;
    const baseBreath = this.baseline?.breathing ?? TYPICAL.breathing;
    const parts = [];
    if (pulse != null) {
      const rel = clamp01((pulse - basePulse * 1.05) / (basePulse * 0.3));
      const abs = clamp01((pulse - 90) / 15);
      const v = Math.max(rel, abs * 0.8);
      const d = Math.round(pulse - basePulse);
      parts.push([0.4, v, d >= 4 ? `Pulse ${Math.round(pulse)} bpm, ${d} above ${this.baseline ? 'your baseline' : 'typical rest'}`
        : d <= -4 ? `Pulse ${Math.round(pulse)} bpm, below ${this.baseline ? 'your baseline' : 'typical rest'}` : `Pulse ${Math.round(pulse)} bpm, near ${this.baseline ? 'your baseline' : 'typical rest'}`]);
    }
    if (breathing != null) {
      const rel = clamp01((breathing - baseBreath - 2) / 8);
      const abs = clamp01((breathing - 18) / 8);
      parts.push([0.3, Math.max(rel, abs), breathing >= 20 ? `Fast breathing (${Math.round(breathing)}/min)`
        : breathing <= 12 ? `Slow, relaxed breathing (${Math.round(breathing)}/min)` : `Breathing ${Math.round(breathing)}/min`]);
    }
    if (hrv != null) {
      parts.push([0.15, clamp01((50 - hrv) / 30), hrv < 25 ? `Low HRV (${Math.round(hrv)} ms)` : `HRV ${Math.round(hrv)} ms`]);
    }
    if (expressions) {
      const neg = NEGATIVE.reduce((a, k) => a + (expressions[k] || 0), 0);
      const top = Object.entries(expressions).sort((a, b) => b[1] - a[1])[0];
      const restingReady = this.negBase.length >= EXPR_BASELINE_SAMPLES;
      const rest = restingReady ? median(this.negBase) : null;
      const v = restingReady ? clamp01((neg - rest) / 35) : 0;
      parts.push([restingReady ? 0.1 : 0.02, v, `Face mostly ${top[0]} (${Math.round(top[1])}%)${restingReady && v > 0.4 ? ', more tense than your resting face' : ''}`]);
    }

    if (!parts.length) {
      return { ready: false, level: null, score: null, reasons: [], pulse, breathing, hrv, expressions, baseline: this.baseline };
    }
    const wsum = parts.reduce((a, p) => a + p[0], 0);
    const raw = (100 * parts.reduce((a, p) => a + p[0] * p[1], 0)) / wsum;
    this.smooth = this.smooth == null ? raw : this.smooth * 0.8 + raw * 0.2;
    const score = Math.round(this.smooth);
    const key = (p) => { const c = p[0] * p[1]; return c < 0.03 ? 0 : c; };
    const reasons = parts.sort((a, b) => (key(b) - key(a)) || (b[0] - a[0])).map((p) => p[2]);
    return {
      ready: pulse != null, level: levelFor(score), score, reasons,
      pulse, breathing, hrv, expressions, baseline: this.baseline,
      calibrating: !this.baseline,
    };
  }
}

export function averageExpressions(list) {
  const out = {};
  for (const e of list) for (const [k, v] of Object.entries(e)) out[k] = (out[k] || 0) + (Number(v) || 0) / list.length;
  return out;
}
