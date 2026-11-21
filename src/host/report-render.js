import { el, fmt, sparkline } from './report-parts.js';

export const renderMethods = {
  render() {
    const m = this.getMember(this.id);
    if (!m) { this.close(); return; }
    const scroll = this.root.querySelector('.rmodal')?.scrollTop || 0;
    this.root.textContent = '';
    const box = el('div', 'modal-box rmodal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    const last = m.reports[m.reports.length - 1];
    const head = el('div', 'rhead');
    const titleWrap = el('div', '');
    titleWrap.appendChild(el('div', 'label', 'Wellness report'));
    titleWrap.appendChild(el('h2', 'rtitle', m.name));
    head.appendChild(titleWrap);
    head.appendChild(el('span', 'spacer'));
    if (last?.simulated) head.appendChild(el('span', 'chip sim', 'SIMULATED'));
    head.appendChild(el('span', `chip ${m.left ? 'declined' : m.consent === 'granted' ? 'granted' : 'pending'}`,
      m.left ? 'Left meeting' : m.consent === 'granted' ? 'Live' : 'Not sharing'));
    const dl = el('button', 'secondary small', '⬇');
    dl.type = 'button';
    dl.title = `Download ${m.name}'s report card`;
    dl.addEventListener('click', () => this.onDownload?.(m.id));
    head.appendChild(dl);
    const x = el('button', 'secondary small', '✕');
    x.type = 'button';
    x.title = 'Close';
    x.addEventListener('click', () => this.close());
    head.appendChild(x);
    box.appendChild(head);
    box.appendChild(el('div', 'muted',
      `${m.reports.length} report${m.reports.length === 1 ? '' : 's'} · one every ~25 s · camera-based wellness estimates, not a medical assessment`));

    if (!last) {
      box.appendChild(el('div', 'muted', 'No reports yet.'));
      this.root.appendChild(box);
      return;
    }

    const grid = el('div', 'rgrid');
    const series = (fn) => m.reports.map(fn);
    const vital = (label, value, unit, sub, values, color) => {
      const c = el('div', 'rcard');
      c.appendChild(el('div', 'label', label));
      const v = el('div', 'rval', value);
      v.appendChild(el('span', 'unit', ` ${unit}`));
      c.appendChild(v);
      c.appendChild(el('div', 'muted', sub));
      c.appendChild(sparkline(values, { color }));
      grid.appendChild(c);
    };
    vital('Pulse', fmt(last.pulse?.avg), 'bpm', last.pulse ? `range ${fmt(last.pulse.min)}–${fmt(last.pulse.max)}` : 'warming up',
      series((r) => r.pulse?.avg), 'var(--c-pulse)');
    vital('Breathing', fmt(last.breathing?.avg), '/min', last.breathing ? `range ${fmt(last.breathing.min)}–${fmt(last.breathing.max)}` : 'warming up',
      series((r) => r.breathing?.avg), 'var(--c-breath)');
    vital('HRV · RMSSD', fmt(last.hrv), 'ms', last.hrv == null ? 'needs ~60 s' : `signal quality ${last.quality}%`,
      series((r) => r.hrv), 'var(--c-hrv)');
    box.appendChild(grid);

    const extra = el('div', 'rsection');
    extra.appendChild(el('div', 'rsection-title', 'Heart rhythm & breathing · last 25 s'));
    const h = last.heart;
    const minis = el('div', 'rminis');
    const mini = (label, value, unit, hint) => {
      const c = el('div', 'rmini');
      c.title = hint;
      c.append(el('b', '', value), el('span', 'unit', unit ? ` ${unit}` : ''), el('div', 'muted', label));
      minis.appendChild(c);
    };
    mini('Avg beat gap', fmt(h?.beatGapMs), 'ms', 'Mean time between heartbeats.');
    mini('SDNN', fmt(h?.sdnnMs), 'ms', 'Variation between heartbeats: higher usually means more relaxed.');
    mini('Stress index', fmt(h?.stressIndex), '', 'Baevsky stress index: lower usually means calmer.');
    mini('Breathing', last.breathStyle ? { chest: 'Chest', belly: 'Belly', mixed: 'Chest + belly' }[last.breathStyle] : '—', '', 'Which part moves most when they breathe.');
    extra.appendChild(minis);
    if (!h) extra.appendChild(el('div', 'muted', 'Heart-rhythm figures need about a minute of sitting still.'));
    else if (!h.confident) extra.appendChild(el('div', 'muted', 'Heart-rhythm figures are low confidence so far.'));
    box.appendChild(extra);

    const f = last.face;
    const eng = el('div', 'rsection');
    eng.appendChild(el('div', 'rsection-title', 'Engagement signals · last 25 s'));
    if (!f) {
      eng.appendChild(el('div', 'muted', 'No face signals in this report.'));
    } else {
      const meters = el('div', 'meters');
      const meter = (label, value, hint) => {
        const row = el('div', 'meter');
        row.appendChild(el('span', 'meter-label', label));
        const bar = el('div', 'meter-bar');
        const fill = el('div', 'meter-fill');
        fill.style.width = `${value == null ? 0 : Math.round(value)}%`;
        bar.appendChild(fill);
        row.appendChild(bar);
        row.appendChild(el('span', 'meter-val', value == null ? '—' : `${Math.round(value)}%`));
        if (hint) row.title = hint;
        meters.appendChild(row);
      };
      meter('Face in frame', f.presentPct);
      meter('Facing screen', f.facingPct, 'Share of time the face pointed at the camera');
      meter('Talking', f.talkingPct);
      eng.appendChild(meters);
      eng.appendChild(el('div', 'muted', `Blinks ≈ ${fmt(f.blinksPerMin)}/min`));

      if (f.expressions) {
        eng.appendChild(el('div', 'rsection-title', 'Expressions'));
        const ex = el('div', 'expr');
        for (const [k, v] of Object.entries(f.expressions).sort((a, b) => b[1] - a[1])) {
          const row = el('div', 'expr-row');
          row.appendChild(el('span', 'expr-name', k));
          const bar = el('div', 'meter-bar');
          const fill = el('div', 'meter-fill alt');
          fill.style.width = `${Math.round(v)}%`;
          bar.appendChild(fill);
          row.appendChild(bar);
          row.appendChild(el('span', 'meter-val', `${Math.round(v)}%`));
          ex.appendChild(row);
        }
        eng.appendChild(ex);
      }
    }
    box.appendChild(eng);

    box.appendChild(this._aiPanel(m));
    this.root.appendChild(box);
    box.scrollTop = scroll;
  },
};
