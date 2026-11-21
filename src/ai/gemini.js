export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export class RateLimitError extends Error {
  constructor(message, retryMs) { super(message); this.retryMs = retryMs; }
}
export class TransientError extends Error {}

export const clip = (s, n) => String(s ?? '').slice(0, n);

function retryDelayMs(body) {
  const details = body?.error?.details || [];
  for (const d of details) {
    const m = /^(\d+(?:\.\d+)?)s$/.exec(d?.retryDelay || '');
    if (m) return Math.ceil(Number(m[1]) * 1000);
  }
  return null;
}

export async function geminiJson(prompt, schema, { apiKey, signal, maxOutputTokens = 2048 } = {}) {
  if (!apiKey) throw new Error('No Gemini API key. Add it in ⚙ Settings.');
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        maxOutputTokens,
      },
    }),
  });
  let body = null;
  try { body = await res.json(); } catch {}
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
  try { return JSON.parse(text); } catch { throw new Error('Gemini returned invalid JSON.'); }
}
