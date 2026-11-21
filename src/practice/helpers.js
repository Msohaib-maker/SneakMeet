export const COACH_INTERVAL_MS = 30000;
export const SECS_PER_CREDIT = 30;
export const EMOJI = { happy: '😊', neutral: '😐', surprise: '😮', sad: '😔', angry: '😠', fear: '😨', disgust: '😖', contempt: '😏' };
export const STATE_LABEL = { calm: 'Calm', steady: 'Steady', tense: 'Tense', anxious: 'Anxious', unknown: 'Reading…' };

const today = () => new Date().toISOString().slice(0, 10);
export const calls = {
  get() { try { return Number(localStorage.getItem(`aiCalls:${today()}`)) || 0; } catch { return 0; } },
  inc() { try { localStorage.setItem(`aiCalls:${today()}`, String(this.get() + 1)); } catch {} },
};
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const r0 = (n) => (Number.isFinite(n) ? Math.round(n) : '—');
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const HOLD = {
  intro: { rowdy: ['Alright champ, do your thing.', "I'm watchin'. Notes comin' your way shortly."], normal: ['Go ahead and begin.', "I'll check in with feedback shortly."] },
  wait: { rowdy: ["Keep swingin', champ.", "I'll debrief ya shortly."], normal: ['Keep going.', "I'll have feedback for you shortly."] },
};

export function holdingMessage(kind = 'wait', rowdy = false) {
  const [headline, feedback] = HOLD[kind][rowdy ? 'rowdy' : 'normal'];
  return { state: 'unknown', headline, feedback, tip: '', expressionNote: '', source: 'holding' };
}
