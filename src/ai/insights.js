import { previewBrief } from './preview-brief.js';
import { clip, geminiJson } from './gemini.js';
import { ROWDY_PROMPT, isRowdy, rowdyOpener } from '../ui/persona.js';

export const AI_PROVIDERS = {
  off: { label: 'Off', network: false },
  preview: { label: 'Rule-based preview (no AI)', network: false },
  gemini: { label: 'Gemini 3.5 Flash-Lite', network: true },
};

export const CAVEAT = 'Camera-based wellness estimates; engagement is a guess from face signals. Not a medical or performance assessment.';

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
      calmMeter: r.calm ? `${r.calm.label} (${r.calm.score}/100, 0 = very calm)` : null,
      heart: r.heart ? { avgBeatGapMs: r.heart.beatGapMs, sdnnMs: r.heart.sdnnMs, stressIndex: r.heart.stressIndex, lowConfidence: !r.heart.confident } : null,
      breathingStyle: r.breathStyle,
    })),
  };
}

const PROMPT = [
  'You are a friendly meeting wellness assistant writing short briefs for the meeting host.',
  'Each participant explicitly consented to share these camera-based wellness estimates with the host.',
  'Reports are ~25 s windows: pulse (bpm), breathing (breaths/min), HRV RMSSD (ms), signal quality (%),',
  'face in frame %, facing the screen %, talking %, blinks/min, mean facial-expression scores (%), and an',
  'on-device calm meter (Calm/Steady/Tense/Anxious, from pulse and breathing vs their own baseline), and when',
  'available heart-rhythm figures (avg beat gap ms, SDNN ms: higher = more relaxed, Baevsky stress index: lower =',
  'calmer; ignore them if lowConfidence) and breathingStyle (chest/belly/mixed movement).',
  'Rules:',
  '- Describe patterns and changes over time in plain, kind language. Never diagnose or name medical or',
  '  mental-health conditions, and never claim certainty about emotions or attention.',
  '- engagement: estimate from facing the screen, face in frame, talking, blinking and expressions.',
  '  "unknown" (score null) if there are no usable face signals.',
  '- Ignore pulse/breathing from reports with quality below 40%, but still describe the calm meter, face and',
  '  engagement signals from them; never answer only that the signal is too low.',
  '- If a participant\'s data is simulated, still analyse it normally.',
  '- headline: at most 8 words, saying how they seem (e.g. calm and engaged, a bit tense). summary: 2-3 short',
  '  sentences for the host: how they seem now, what changed over time, and one gentle suggestion if useful',
  '  (e.g. check in with them, give them a moment). reasons and observations: at most 3 each.',
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
  const persona = isRowdy() ? `\n${ROWDY_PROMPT}\n- You are talking to the meeting host ("boss") about the participant: tease the situation, not the person.` : '';
  return `${PROMPT}${persona}\n\nDATA:\n${JSON.stringify({ participants: entries.map((e) => ({ ref: e.ref, ...e.input })) })}`;
}

export async function generateBriefs(providerId, entries, { apiKey, signal } = {}) {
  if (providerId === 'preview') {
    return Object.fromEntries(entries.map((e) => {
      const b = previewBrief(e.input);
      return [e.ref, isRowdy() ? { ...b, summary: `${rowdyOpener()} ${b.summary}` } : b];
    }));
  }
  if (providerId === 'gemini') return geminiBriefs(entries, { apiKey, signal });
  throw new Error('AI insights are off.');
}

const LEVELS = ['high', 'medium', 'low', 'unknown'];

function sanitizeBrief(b) {
  const e = b?.engagement || {};
  const level = LEVELS.includes(e.level) ? e.level : 'unknown';
  const score = Number.isFinite(e.score) ? Math.max(0, Math.min(100, Math.round(e.score))) : null;
  const list = (xs) => (Array.isArray(xs) ? xs.slice(0, 3).map((x) => clip(x, 200)).filter(Boolean) : []);
  return {
    headline: clip(b?.headline, 80),
    summary: clip(b?.summary, 520),
    engagement: { level, score: level === 'unknown' ? null : score, reasons: list(e.reasons) },
    observations: list(b?.observations),
  };
}

async function geminiBriefs(entries, { apiKey, signal }) {
  const parsed = await geminiJson(buildPrompt(entries), RESPONSE_SCHEMA, { apiKey, signal });
  const out = {};
  const refs = new Set(entries.map((e) => e.ref));
  for (const p of parsed?.participants || []) {
    if (refs.has(p?.ref)) out[p.ref] = sanitizeBrief(p);
  }
  return out;
}
