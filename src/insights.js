// AI insights: turn participants' recent wellness reports (vitals + face/
// engagement signals) into short plain-language briefs for the host.
//
// One request covers EVERY participant (batched) to stay well inside free-tier
// limits. Participants are sent as anonymous refs (P1, P2…): names and video
// never leave the host's app.
//
// Providers:
//   preview : rule-based placeholder, runs locally, NOT AI, no network.
//   gemini  : Google Gemini API (key from aistudio.google.com).

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export const AI_PROVIDERS = {
  off: { label: 'Off', network: false },
  preview: { label: 'Rule-based preview (no AI)', network: false },
  gemini: { label: 'Gemini 3.5 Flash-Lite', network: true },
};

export const CAVEAT = 'Camera-based wellness estimates; engagement is a guess from face signals. Not a medical or performance assessment.';

const round = (n) => (Number.isFinite(n) ? Math.round(n) : null);
const avg = (xs) => {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export class RateLimitError extends Error {
  constructor(message, retryMs) { super(message); this.retryMs = retryMs; }
}
export class TransientError extends Error {}

// Last few reports of one member, anonymised and compacted.
export function buildMemberInput(member, maxReports = 8) {
  const reports = member.reports.slice(-maxReports);
  return {
    simulated: reports.some((r) => r.simulated),
    reports: reports.map((r) => ({
      t: new Date(r.at).toISOString().slice(11, 19),
      pulse: r.pulse?.avg ?? null,
      breathing: r.breathing?.avg ?? null,
      hrv: r.hrv,
      quality: r.quality,
      facePresentPct: r.face?.presentPct ?? null,
      facingScreenPct: r.face?.facingPct ?? null,
      talkingPct: r.face?.talkingPct ?? null,
      blinksPerMin: r.face?.blinksPerMin ?? null,
      expressions: r.face?.expressions ?? null,
    })),
  };
}

const PROMPT = [
  'You are a friendly meeting wellness assistant writing short briefs for the meeting host.',
  'Each participant explicitly consented to share these camera-based wellness estimates with the host.',
  'Reports are ~25 s windows: pulse (bpm), breathing (breaths/min), HRV RMSSD (ms), signal quality (%),',
  'face in frame %, facing the screen %, talking %, blinks/min, and mean facial-expression scores (%).',
  'Rules:',
  '- Describe patterns and changes over time in plain, kind language. Never diagnose or name medical or',
  '  mental-health conditions, and never claim certainty about emotions or attention.',
  '- engagement: estimate from facing the screen, face in frame, talking, blinking and expressions.',
  '  "unknown" (score null) if there are no usable face signals.',
  '- Ignore reports with quality below 40%. If a participant\'s data is simulated, still analyse it normally.',
  '- headline: at most 8 words. summary: at most 2 short sentences. reasons and observations: at most 3 each.',
  'Return one entry per participant ref given.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    participants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          headline: { type: 'string' },
          summary: { type: 'string' },
          engagement: {
            type: 'object',
            properties: {
              level: { type: 'string', enum: ['high', 'medium', 'low', 'unknown'] },
              score: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
              reasons: { type: 'array', items: { type: 'string' } },
            },
            required: ['level', 'score', 'reasons'],
          },
          observations: { type: 'array', items: { type: 'string' } },
        },
        required: ['ref', 'headline', 'summary', 'engagement', 'observations'],
      },
    },
  },
  required: ['participants'],
};

export function buildPrompt(entries) {
  return `${PROMPT}\n\nDATA:\n${JSON.stringify({ participants: entries.map((e) => ({ ref: e.ref, ...e.input })) })}`;
}

// entries: [{ ref, input }] -> { [ref]: brief }
export async function generateBriefs(providerId, entries, { apiKey, signal } = {}) {
  if (providerId === 'preview') {
    return Object.fromEntries(entries.map((e) => [e.ref, previewBrief(e.input)]));
  }
  if (providerId === 'gemini') return geminiBriefs(entries, { apiKey, signal });
  throw new Error('AI insights are off.');
}

// --- Gemini ------------------------------------------------------------------

const clip = (s, n) => String(s ?? '').slice(0, n);
const LEVELS = ['high', 'medium', 'low', 'unknown'];

// Keep only well-formed, bounded fields from the model output.
function sanitizeBrief(b) {
  const e = b?.engagement || {};
  const level = LEVELS.includes(e.level) ? e.level : 'unknown';
  const score = Number.isFinite(e.score) ? Math.max(0, Math.min(100, Math.round(e.score))) : null;
  const list = (xs) => (Array.isArray(xs) ? xs.slice(0, 3).map((x) => clip(x, 200)).filter(Boolean) : []);
  return {
    headline: clip(b?.headline, 80),
    summary: clip(b?.summary, 400),
    engagement: { level, score: level === 'unknown' ? null : score, reasons: list(e.reasons) },
    observations: list(b?.observations),
  };
}

function retryDelayMs(body) {
  const details = body?.error?.details || [];
  for (const d of details) {
    const m = /^(\d+(?:\.\d+)?)s$/.exec(d?.retryDelay || '');
    if (m) return Math.ceil(Number(m[1]) * 1000);
  }
  return null;
}

async function geminiBriefs(entries, { apiKey, signal }) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in ⚙ Settings.');
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(entries) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 2048,
      },
    }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  if (res.status === 429) {
    throw new RateLimitError('Gemini rate limit reached.', retryDelayMs(body));
  }
  if (res.status >= 500) {
    throw new TransientError(`Gemini is busy (${res.status}), retrying shortly.`);
  }
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${clip(body?.error?.message || res.statusText, 200)}`);
  }
  const parts = body?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  if (!text) throw new Error(`Gemini returned no text (${body?.candidates?.[0]?.finishReason || 'unknown reason'}).`);
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Gemini returned invalid JSON.'); }
  const out = {};
  const refs = new Set(entries.map((e) => e.ref));
  for (const p of parsed?.participants || []) {
    if (refs.has(p?.ref)) out[p.ref] = sanitizeBrief(p);
  }
  return out;
}

// --- Placeholder: simple rules, clearly labelled as not AI -------------------

function previewBrief(input) {
  const rs = input.reports.filter((r) => r.quality == null || r.quality >= 40);
  if (!rs.length) {
    return {
      headline: 'Waiting for clear readings',
      summary: 'Not enough good-quality data yet.',
      engagement: { level: 'unknown', score: null, reasons: [] },
      observations: [],
    };
  }
  const recent = rs.slice(-3);
  const facing = avg(recent.map((r) => r.facingScreenPct));
  const present = avg(recent.map((r) => r.facePresentPct));
  const talking = avg(recent.map((r) => r.talkingPct));
  const blinks = avg(recent.map((r) => r.blinksPerMin));
  const pulseNow = avg(recent.map((r) => r.pulse));
  const pulseStart = avg(rs.slice(0, 3).map((r) => r.pulse));
  const breathNow = avg(recent.map((r) => r.breathing));
  const ex = {};
  for (const r of recent) for (const [k, v] of Object.entries(r.expressions || {})) ex[k] = (ex[k] || 0) + v / recent.length;
  const topEx = Object.entries(ex).sort((a, b) => b[1] - a[1])[0];

  const reasons = [];
  let score = 50;
  if (facing != null) {
    score = facing * 0.7 + (present ?? facing) * 0.3;
    reasons.push(`Facing the screen ~${round(facing)}% of the time`);
  }
  if (talking != null && talking > 15) { score += 8; reasons.push(`Talking ~${round(talking)}% of the time`); }
  if (blinks != null && blinks > 30) { score -= 8; reasons.push(`Blinking often (~${round(blinks)}/min)`); }
  score = Math.max(0, Math.min(100, round(score)));
  const level = facing == null ? 'unknown' : score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

  const observations = [];
  if (pulseNow != null && pulseStart != null && Math.abs(pulseNow - pulseStart) >= 5) {
    observations.push(`Pulse ${pulseNow > pulseStart ? 'rose' : 'fell'} from ~${round(pulseStart)} to ~${round(pulseNow)} bpm.`);
  } else if (pulseNow != null) observations.push(`Pulse steady around ${round(pulseNow)} bpm.`);
  if (breathNow != null) observations.push(`Breathing around ${round(breathNow)}/min.`);
  if (topEx) observations.push(`Mostly ${topEx[0]} (${round(topEx[1])}%).`);

  return {
    headline: level === 'unknown' ? 'Engagement unclear' : `Engagement looks ${level}`,
    summary: observations.slice(0, 2).join(' ') || 'Vitals not available yet.',
    engagement: { level, score: level === 'unknown' ? null : score, reasons },
    observations,
  };
}
