import { drawWave } from '../ui/wave.js';
import { movementShare } from '../vitals/extra.js';
import { el } from './helpers.js';

const r0 = (n) => (Number.isFinite(n) ? String(Math.round(n)) : '—');

export const detailsMethods = {
  _renderDetails() {
    const d = this.ui.details;
    if (!d || !d.root.open) return;
    const x = this.latest?.m?.extra;
    if (!x) return;
    drawWave(d.breath, [{ data: x.belly, color: '#8b5cff', width: 1.5 }, { data: x.chest, color: '#00e5ff' }], { ok: x.breathOk, span: 450 });
    drawWave(d.pulse, [{ data: x.pressure, color: '#ff4d8d' }], { ok: x.pulseOk, span: 150 });
    const share = x.breathOk ? movementShare(x) : null;
    d.breathNote.textContent = !x.chest.length ? 'waiting for signal…' : !x.breathOk ? 'weak signal'
      : share == null ? '' : share > 0.55 ? 'mostly belly breathing' : share < 0.4 ? 'mostly chest breathing' : 'chest + belly';
    d.pulseNote.textContent = !x.pressure.length ? 'waiting for signal…' : x.pulseOk ? 'each peak is one heartbeat' : 'weak signal';
    d.hrv.textContent = '';
    const stat = (label, value, unit, hint) => {
      const c = el('div', 'p-stat');
      c.title = hint;
      c.append(el('b', '', value), el('small', '', ` ${unit}`), el('div', 'label', label));
      d.hrv.appendChild(c);
    };
    stat('Avg beat gap', r0(x.meanNn), 'ms', 'Mean time between heartbeats (from HRV).');
    stat('SDNN', r0(x.sdnn), 'ms', 'Variation between heartbeats: higher usually means more relaxed.');
    stat('Stress index', r0(x.baevsky), '', 'Baevsky stress index: lower usually means calmer.');
    d.hrvNote.textContent = x.meanNn == null ? 'Heart-rhythm details appear after ~1 min of sitting still.'
      : x.hrvOk ? '' : 'Heart-rhythm details are still settling (low confidence).';
  },
};
