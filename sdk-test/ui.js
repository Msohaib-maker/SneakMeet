import {
  MetricType,
  ProcessingStatus,
  SmartSpectraErrorCode,
  ValidationCode,
} from '@smartspectra/node-sdk/renderer';
import { elapsed, summary } from './session.js';

export const $ = (id) => document.getElementById(id);
const nameMap = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k.replace(/^k/, '')]));
export const STATUS = nameMap(ProcessingStatus);
export const VALID = nameMap(ValidationCode);
export const ERR = nameMap(SmartSpectraErrorCode);
export const METRIC_NAME = nameMap(MetricType);
export const EXPR = { 1: 'angry', 2: 'contempt', 3: 'disgust', 4: 'fear', 5: 'happy', 6: 'neutral', 7: 'sad', 8: 'surprise' };
export const SECS_PER_CREDIT = 30;

const GROUPS = {
  Breathing: ['CHEST_BREATHING', 'ABDOMEN_BREATHING', 'BREATHING_RATE', 'BREATHING_AMPLITUDE', 'APNEA',
    'RESPIRATORY_LINE_LENGTH', 'BASELINE', 'INHALE_EXHALE_RATIO', 'BREATHING_RATE_STRICT'],
  Cardio: ['PULSE_RATE', 'ARTERIAL_PRESSURE_TRACE', 'HRV', 'PULSE_RATE_STRICT'],
  Face: ['BLINKING', 'TALKING', 'EXPRESSIONS', 'FACE_LANDMARKS'],
  'Body / other': ['GLUTES_MICROMOTION', 'KNEES_MICROMOTION', 'EDA_TRACE'],
};
const CORE = ['CHEST_BREATHING', 'ABDOMEN_BREATHING', 'BREATHING_RATE', 'PULSE_RATE', 'ARTERIAL_PRESSURE_TRACE',
  'HRV', 'BLINKING', 'TALKING', 'EXPRESSIONS'];

const list = $('metric-list');
for (const [group, names] of Object.entries(GROUPS)) {
  const div = document.createElement('div');
  div.className = 'group';
  div.innerHTML = `<b>${group}</b>` + names.filter((n) => n in MetricType).map((n) =>
    `<label><input type="checkbox" value="${n}" ${CORE.includes(n) ? 'checked' : ''}> ${n.toLowerCase().replace(/_/g, ' ')}</label>`).join('');
  list.appendChild(div);
}
export const boxes = () => [...list.querySelectorAll('input[type=checkbox]')];
$('sel-all').onclick = () => boxes().forEach((b) => { b.checked = true; });
$('sel-none').onclick = () => boxes().forEach((b) => { b.checked = false; });
$('sel-core').onclick = () => boxes().forEach((b) => { b.checked = CORE.includes(b.value); });
try { $('key').value = localStorage.getItem('apiKey') || __DEFAULT_API_KEY__; } catch { $('key').value = __DEFAULT_API_KEY__; }

export const CARDS = [
  ['br.rate', 'Breathing rate', 'bpm'],
  ['br.strict', 'Breathing rate (strict)', 'bpm'],
  ['br.upper', 'Chest breathing trace', '', true],
  ['br.lower', 'Abdomen breathing trace', '', true],
  ['br.amp', 'Breathing amplitude', '', true],
  ['br.apnea', 'Apnea', ''],
  ['br.rll', 'Respiratory line length', '', true],
  ['br.base', 'Breathing baseline', '', true],
  ['br.ie', 'Inhale / exhale ratio', ''],
  ['cv.pulse', 'Pulse rate', 'bpm'],
  ['cv.strict', 'Pulse rate (strict)', 'bpm'],
  ['cv.apt', 'Arterial pressure trace', '', true],
  ['cv.hrv', 'HRV', ''],
  ['fc.blink', 'Blinking', ''],
  ['fc.talk', 'Talking', ''],
  ['fc.expr', 'Expressions', ''],
  ['fc.lm', 'Face landmarks', ''],
  ['mm.glutes', 'Glutes micromotion', '', true],
  ['mm.knees', 'Knees micromotion', '', true],
  ['eda', 'EDA proxy trace', '', true],
];
export const cards = {};
for (const [id, title, unit, spark] of CARDS) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `<div class="t"><span>${title}</span><span class="first"></span></div>
    <div class="v">-</div><div class="s">no data</div>${spark ? '<canvas width="460" height="68"></canvas>' : ''}`;
  $('cards').appendChild(el);
  cards[id] = { el, unit, title, v: el.querySelector('.v'), s: el.querySelector('.s'), first: el.querySelector('.first'),
    canvas: el.querySelector('canvas'), series: [], count: 0, firstAt: null, last: null };
}

export const num = (x) => (x == null ? null : Number(x));
export const fmt = (x, d = 1) => (x == null || Number.isNaN(x) ? '-' : Number(x).toFixed(d));
export const lastOf = (a) => (a && a.length ? a[a.length - 1] : null);

export function touch(id, value, sub, points, summary) {
  const c = cards[id];
  if (!c) return;
  c.count += 1;
  if (c.firstAt == null) { c.firstAt = elapsed(); c.el.classList.add('seen'); c.first.textContent = `first @ ${c.firstAt.toFixed(1)} s`; }
  c.v.innerHTML = value;
  c.s.textContent = `${sub ? sub + ' · ' : ''}${c.count} updates`;
  c.last = summary ?? value;
  if (points && c.canvas) {
    for (const p of points) c.series.push(p);
    if (c.series.length > 300) c.series.splice(0, c.series.length - 300);
    drawSpark(c.canvas, c.series);
  }
}

function drawSpark(cv, s) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  if (s.length < 2) return;
  const min = Math.min(...s), max = Math.max(...s), span = max - min || 1;
  g.strokeStyle = '#5b8def'; g.lineWidth = 2; g.beginPath();
  s.forEach((y, i) => {
    const px = (i / (s.length - 1)) * cv.width, py = cv.height - 3 - ((y - min) / span) * (cv.height - 6);
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  });
  g.stroke();
}

export function measField(id, arr, unit, d = 1) {
  if (!arr || !arr.length) return;
  const l = lastOf(arr);
  const extra = [l.stable ? 'stable' : 'not stable'];
  if (l.confidence != null) extra.push(`conf ${fmt(l.confidence, 2)}`);
  touch(id, `${fmt(num(l.value), d)} <small>${unit}</small>`, extra.join(', '), arr.map((m) => num(m.value)), `${fmt(num(l.value), d)} ${unit}`.trim());
}

export function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  $('log').textContent += line; $('log').scrollTop = 1e9; console.log('[sdk-test]', msg);
}
export function pill(el, text, cls) { el.textContent = text; el.className = `pill ${cls || ''}`; }
export function setRunning(on) {
  $('start').disabled = on; $('stop').disabled = !on; $('insight').disabled = !on;
  boxes().forEach((b) => { b.disabled = on; });
}
