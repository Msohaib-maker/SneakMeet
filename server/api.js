'use strict';

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_BODY = 64 * 1024;
const LIMITS = {
  gemini: { max: 60, windowMs: 10 * 60000 },
  sdkKey: { max: 20, windowMs: 10 * 60000 },
  geminiPerDay: Number(process.env.GEMINI_DAILY_CAP) || 1500,
};

const hits = new Map();
let day = '';
let dayCount = 0;

function allow(bucket, ip) {
  const { max, windowMs } = LIMITS[bucket];
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(now);
  hits.set(key, list);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, list] of hits) if (!list.some((t) => now - t < 10 * 60000)) hits.delete(k);
}, 60000).unref();

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function geminiPayload(body) {
  const contents = Array.isArray(body?.contents) ? body.contents.slice(0, 4) : null;
  if (!contents || !contents.length) return null;
  const textLen = JSON.stringify(contents).length;
  if (textLen > 40000) return null;
  const g = body.generationConfig || {};
  return {
    contents,
    generationConfig: {
      responseMimeType: 'application/json',
      ...(g.responseJsonSchema ? { responseJsonSchema: g.responseJsonSchema } : {}),
      maxOutputTokens: Math.min(Number(g.maxOutputTokens) || 1024, 2048),
    },
  };
}

async function handleApi(req, res) {
  const path = new URL(req.url, 'http://local').pathname;
  if (!path.startsWith('/api/')) return false;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
  const ip = String(req.headers['fly-client-ip'] || req.socket.remoteAddress || 'unknown');

  if (path === '/api/status' && req.method === 'GET') {
    json(res, 200, { gemini: !!process.env.GEMINI_API_KEY, smartspectra: !!process.env.SMARTSPECTRA_API_KEY });
    return true;
  }

  if (path === '/api/sdk-key' && req.method === 'GET') {
    const key = process.env.SMARTSPECTRA_API_KEY;
    if (!key) { json(res, 404, { error: { message: 'This server has no SmartSpectra key.' } }); return true; }
    if (!allow('sdkKey', ip)) { json(res, 429, { error: { message: 'Too many requests, try again in a few minutes.' } }); return true; }
    json(res, 200, { apiKey: key });
    return true;
  }

  if (path === '/api/gemini' && req.method === 'POST') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) { json(res, 400, { error: { message: 'AI is not configured on this server.' } }); return true; }
    if (!allow('gemini', ip)) { json(res, 429, { error: { message: 'Too many AI requests from this computer.' } }); return true; }
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; dayCount = 0; }
    if (dayCount >= LIMITS.geminiPerDay) { json(res, 429, { error: { message: 'The server reached its daily AI limit.' } }); return true; }
    let payload;
    try { payload = geminiPayload(JSON.parse(await readBody(req))); } catch { payload = null; }
    if (!payload) { json(res, 400, { error: { message: 'Bad request.' } }); return true; }
    dayCount += 1;
    try {
      const r = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(text);
    } catch (e) {
      json(res, 502, { error: { message: 'Could not reach Gemini.' } });
    }
    return true;
  }

  json(res, 404, { error: { message: 'Not found.' } });
  return true;
}

module.exports = { handleApi };
