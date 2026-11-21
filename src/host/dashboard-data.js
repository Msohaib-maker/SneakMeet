import { LEVELS } from '../vitals/calm-meter.js';

export const CONSENT_LABELS = {
  pending: ['Waiting for consent', 'pending'],
  granted: ['Sharing reports', 'granted'],
  declined: ['Declined', 'declined'],
  revoked: ['Stopped sharing', 'declined'],
};
export const MAX_HISTORY = 60;

const num = (n) => (n == null || !Number.isFinite(Number(n)) ? null : Number(n));
const range = (s) => (s ? { avg: num(s.avg), min: num(s.min), max: num(s.max) } : null);
const pct = (n) => (num(n) == null ? null : Math.max(0, Math.min(100, num(n))));
const EXPRESSION_KEYS = ['neutral', 'happy', 'surprise', 'sad', 'angry', 'fear', 'disgust', 'contempt'];
const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
export const STATE_EMOJI = { calm: '😌', steady: '🙂', tense: '😬', anxious: '😟' };

export function sanitizeCalm(c) {
  const lvl = c && LEVEL_BY_ID[c.id];
  if (!lvl) return null;
  const score = num(c.score);
  return { id: lvl.id, label: lvl.label, score: score == null ? null : Math.max(0, Math.min(100, Math.round(score))) };
}

function sanitizeFace(f) {
  if (!f || typeof f !== 'object') return null;
  let expressions = null;
  if (f.expressions && typeof f.expressions === 'object') {
    expressions = {};
    for (const k of EXPRESSION_KEYS) if (pct(f.expressions[k]) != null) expressions[k] = pct(f.expressions[k]);
  }
  return {
    presentPct: pct(f.presentPct),
    facingPct: pct(f.facingPct),
    talkingPct: pct(f.talkingPct),
    blinksPerMin: num(f.blinksPerMin) == null ? null : Math.max(0, Math.min(120, num(f.blinksPerMin))),
    expressions,
  };
}

export function sanitizeReport(r) {
  return {
    at: Date.now(),
    measuring: !!r.measuring,
    simulated: !!r.simulated,
    samples: num(r.samples) ?? 0,
    pulse: range(r.pulse),
    breathing: range(r.breathing),
    hrv: num(r.hrv),
    quality: Math.max(0, Math.min(100, num(r.quality) ?? 0)),
    trend: { pulse: num(r.trend?.pulse), breathing: num(r.trend?.breathing) },
    face: sanitizeFace(r.face),
    calm: sanitizeCalm(r.calm),
    heart: r.heart ? { beatGapMs: num(r.heart.beatGapMs), sdnnMs: num(r.heart.sdnnMs), stressIndex: num(r.heart.stressIndex), confident: !!r.heart.confident } : null,
    breathStyle: ['chest', 'belly', 'mixed'].includes(r.breathStyle) ? r.breathStyle : null,
  };
}

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function topExpression(face) {
  const e = face?.expressions;
  if (!e) return '';
  const top = Object.entries(e).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : '';
}
