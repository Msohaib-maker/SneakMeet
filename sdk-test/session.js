import { decodeMetrics } from '@smartspectra/node-sdk/messages';
import {
  $,
  CARDS,
  ERR,
  EXPR,
  SECS_PER_CREDIT,
  STATUS,
  VALID,
  boxes,
  cards,
  fmt,
  lastOf,
  log,
  measField,
  num,
  pill,
  setRunning,
  touch,
} from './ui.js';
import {
  MetricType,
  ProcessingStatus,
  SmartSpectraSDK,
  ValidationCode,
} from '@smartspectra/node-sdk/renderer';

function onMetrics(buf) {
  let m;
  try { m = decodeMetrics(buf); } catch (e) { log(`decode error: ${e.message}`); return; }
  packets += 1;
  if (packets === 1) log(`First metrics packet. Top-level groups: ${Object.keys(m.toJSON ? m.toJSON() : m).join(', ') || '(empty)'}`);

  const b = m.breathing;
  if (b) {
    measField('br.rate', b.rate, 'bpm');
    if (b.breathingRateStrict && b.breathingRateStrict.value != null) {
      const s = b.breathingRateStrict;
      touch('br.strict', `${fmt(num(s.value))} <small>bpm</small>`, s.stable ? 'stable' : 'not stable', null, `${fmt(num(s.value))} bpm`);
    }
    measField('br.upper', b.upperTrace, '', 3);
    measField('br.lower', b.lowerTrace, '', 3);
    measField('br.amp', b.amplitude, '', 3);
    if (b.apnea?.length) { const a = lastOf(b.apnea); touch('br.apnea', a.detected ? 'detected' : 'not detected', a.stable ? 'stable' : 'not stable'); }
    measField('br.rll', b.respiratoryLineLength, '', 3);
    measField('br.base', b.baseline, '', 3);
    measField('br.ie', b.inhaleExhaleRatio, '', 2);
  }

  const c = m.cardio;
  if (c) {
    measField('cv.pulse', c.pulseRate, 'bpm');
    if (c.pulseRateStrict && c.pulseRateStrict.value != null) {
      const s = c.pulseRateStrict;
      touch('cv.strict', `${fmt(num(s.value))} <small>bpm</small>`, s.stable ? 'stable' : 'not stable', null, `${fmt(num(s.value))} bpm`);
    }
    measField('cv.apt', c.arterialPressureTrace, '', 3);
    if (c.hrv?.length) {
      const h = lastOf(c.hrv);
      const txt = `RMSSD ${fmt(num(h.rmssd))} ms`;
      touch('cv.hrv', `${txt}`, `meanNN ${fmt(num(h.meanNn), 0)} · SDNN ${fmt(num(h.sdnn))} · Baevsky ${fmt(num(h.baevsky))} · conf ${fmt(h.confidence, 2)} · ${h.stable ? 'stable' : 'not stable'}`,
        null, `${txt}, SDNN ${fmt(num(h.sdnn))}, meanNN ${fmt(num(h.meanNn), 0)}, Baevsky ${fmt(num(h.baevsky))}, conf ${fmt(h.confidence, 2)}`);
    }
  }

  const f = m.face;
  if (f) {
    if (f.blinking?.length) {
      for (const x of f.blinking) { if (x.detected && !blinkOn) blinks += 1; blinkOn = !!x.detected; }
      touch('fc.blink', `${blinks} <small>blinks</small>`, blinkOn ? 'eyes closed now' : 'eyes open', null, `${blinks} blinks`);
    }
    if (f.talking?.length) { const t = lastOf(f.talking); touch('fc.talk', t.detected ? 'talking' : 'quiet', t.stable ? 'stable' : 'not stable'); }
    if (f.expression?.length) {
      const e = lastOf(f.expression);
      const scores = (e.scores || []).map((s) => [EXPR[s.type] || `type ${s.type}`, Number(s.confidence) || 0]).sort((a, b2) => b2[1] - a[1]);
      if (scores.length) {
        const bars = scores.map(([n, v]) => `<div><span>${n}</span><i style="width:${Math.round(v * 120)}px"></i>${fmt(v, 2)}</div>`).join('');
        touch('fc.expr', `<div class="bars">${bars}</div>`, e.stable ? 'stable' : 'not stable', null, `top: ${scores[0][0]} ${fmt(scores[0][1], 2)}`);
      }
    }
    if (f.landmarks?.length) { const l = lastOf(f.landmarks); touch('fc.lm', `${l.value?.length || 0} <small>points</small>`, l.stable ? 'stable' : 'not stable'); }
  }

  if (m.micromotion) {
    measField('mm.glutes', m.micromotion.glutes, '', 3);
    measField('mm.knees', m.micromotion.knees, '', 3);
  }
  if (m.eda) measField('eda', m.eda.trace, '', 3);
}

export let sdk = null, startedAt = 0, tick = null, packets = 0, blinks = 0, blinkOn = false, sessionSeconds = 0, stopping = false;
const lastRun = { requested: [], errors: [], durationSec: 0 };

export function elapsed() { return startedAt ? (performance.now() - startedAt) / 1000 : 0; }

function updateCredits() {
  const e = elapsed();
  $('elapsed').textContent = `${e.toFixed(1)} s`;
  $('credits').textContent = Math.ceil(e / SECS_PER_CREDIT);
  $('session-credits').textContent = Math.ceil((sessionSeconds + e) / SECS_PER_CREDIT);
  $('frames').textContent = packets;
  const cap = Number($('cap').value);
  if (sdk && e >= cap && !stopping) { log(`Auto-stop: reached ${cap} s cap.`); stop(); }
}

export async function start() {
  const apiKey = $('key').value.trim();
  if (!apiKey) { log('Enter an API key first.'); return; }
  try { localStorage.setItem('apiKey', apiKey); } catch {}
  const names = boxes().filter((b) => b.checked).map((b) => b.value);
  if (!names.length) { log('Tick at least one metric.'); return; }

  for (const c of Object.values(cards)) {
    Object.assign(c, { series: [], count: 0, firstAt: null, last: null });
    c.el.classList.remove('seen'); c.v.textContent = '-'; c.s.textContent = 'no data'; c.first.textContent = '';
    if (c.canvas) c.canvas.getContext('2d').clearRect(0, 0, c.canvas.width, c.canvas.height);
  }
  packets = 0; blinks = 0; blinkOn = false; $('insight-out').textContent = '';
  Object.assign(lastRun, { requested: names, errors: [], durationSec: 0 });

  log(`Starting with ${names.length} metrics: ${names.join(', ')}`);
  setRunning(true);
  sdk = new SmartSpectraSDK({ apiKey, requestedMetrics: names.map((n) => MetricType[n]), enableAccumulatedOutput: false });
  sdk.on('streamAvailable', (stream) => { $('video').srcObject = stream; });
  sdk.on('processingStatus', (s) => {
    pill($('status'), STATUS[s] || `Status ${s}`, s === ProcessingStatus.kRunning ? 'ok' : s === ProcessingStatus.kError ? 'bad' : 'warn');
    log(`status: ${STATUS[s] || s}`);
    if (s === ProcessingStatus.kError) setTimeout(stop, 0);
  });
  let lastHint = '';
  sdk.on('validationStatus', (code, _ts, hint) => {
    const name = VALID[code] || `Code ${code}`;
    pill($('hint'), hint || name, code === ValidationCode.kOk ? 'ok' : 'warn');
    if (name !== lastHint) { lastHint = name; log(`validation: ${name}${hint ? ` (${hint})` : ''}`); }
  });
  sdk.on('metrics', onMetrics);
  sdk.on('error', (code, message, retryable) => {
    const e = `${ERR[code] || code}: ${message}${retryable ? ' (retryable)' : ''}`;
    lastRun.errors.push(e); log(`ERROR ${e}`);
  });
  sdk.on('insight', (buf, id) => {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = `(binary, ${buf.length} bytes) ${[...buf.slice(0, 64)].map((x) => x.toString(16).padStart(2, '0')).join(' ')}`; }
    $('insight-out').textContent += `#${id}: ${text}\n`;
    log(`insight #${id} received (${buf.length} bytes)`);
  });

  startedAt = performance.now();
  tick = setInterval(updateCredits, 250);
  try {
    await sdk.start();
    log('sdk.start() resolved.');
  } catch (err) {
    const e = `start failed: ${err.code != null ? (ERR[err.code] || err.code) + ' ' : ''}${err.message}`;
    lastRun.errors.push(e); log(e);
    await stop();
  }
}

export async function stop() {
  if (!sdk || stopping) return;
  stopping = true;
  const s = sdk;
  const dur = elapsed();
  clearInterval(tick); tick = null;
  sessionSeconds += dur; lastRun.durationSec = Math.round(dur);
  startedAt = 0;
  updateCredits();
  $('elapsed').textContent = `${dur.toFixed(1)} s`;
  $('credits').textContent = Math.ceil(dur / SECS_PER_CREDIT);
  try { await s.stop(); } catch (e) { log(`stop error: ${e.message}`); }
  try { s.destroy(); } catch {}
  sdk = null; stopping = false;
  $('video').srcObject = null;
  setRunning(false);
  pill($('status'), 'Stopped');
  log(`Stopped after ${dur.toFixed(1)} s (~${Math.ceil(dur / SECS_PER_CREDIT)} credits).`);
  log(summary());
}

export function summary() {
  const rows = CARDS.map(([id, title]) => {
    const c = cards[id];
    return c.count ? `  OK   ${title.padEnd(26)} first @ ${c.firstAt.toFixed(1)} s, ${c.count} updates, last: ${String(c.last).replace(/<[^>]+>/g, '')}`
      : `  --   ${title}`;
  });
  return [`SDK metric test — ${new Date().toISOString()} — SDK ${SmartSpectraSDK.version || '?'}`,
    `Requested: ${lastRun.requested.join(', ')}`, `Duration: ${lastRun.durationSec} s, packets: ${packets}`,
    `Errors: ${lastRun.errors.length ? lastRun.errors.join(' | ') : 'none'}`, 'Readings:', ...rows].join('\n');
}
