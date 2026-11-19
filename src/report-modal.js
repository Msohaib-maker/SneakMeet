// Host-only modal with one participant's full report: vitals trends,
// face/engagement signals, and the AI insights panel.
import { AI_PROVIDERS, buildMemberInput, CAVEAT } from './insights.js';

const SVG = 'http://www.w3.org/2000/svg';
const fmt = (n) => (n == null || !Number.isFinite(n) ? '—' : String(Math.round(n)));

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Small line chart of one series (values may contain nulls).
function sparkline(values, { color = 'var(--accent)', height = 56 } = {}) {
  const w = 300;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('spark');
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => Number.isFinite(v));
  if (pts.length < 2) {
    const t = document.createElementNS(SVG, 'text');
    t.setAttribute('x', '6'); t.setAttribute('y', String(height / 2 + 4));
    t.setAttribute('class', 'spark-empty');
    t.textContent = 'collecting…';
    svg.appendChild(t);
    return svg;
  }
  const ys = pts.map(([, v]) => v);
  let lo = Math.min(...ys); let hi = Math.max(...ys);
  if (hi - lo < 4) { lo -= 2; hi += 2; }
  const n = Math.max(values.length - 1, 1);
  const xy = pts.map(([i, v]) => [(i / n) * w, height - 6 - ((v - lo) / (hi - lo)) * (height - 12)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = document.createElementNS(SVG, 'path');
  area.setAttribute('d', `${d} L${xy[xy.length - 1][0]},${height} L${xy[0][0]},${height} Z`);
  area.setAttribute('fill', color);
  area.setAttribute('opacity', '0.12');
  const line = document.createElementNS(SVG, 'path');
  line.setAttribute('d', d);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '2');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  const dot = document.createElementNS(SVG, 'circle');
  const [lx, ly] = xy[xy.length - 1];
  dot.setAttribute('cx', String(lx)); dot.setAttribute('cy', String(ly)); dot.setAttribute('r', '3');
  dot.setAttribute('fill', color);
  svg.append(area, line, dot);
  return svg;
}

export class ReportModal {
  // getMember(id); getProvider(); getBriefer() -> AIBriefer (shared, host-wide)
  constructor(root, { getMember, getProvider, getBriefer }) {
    this.root = root;
    this.getMember = getMember;
    this.getProvider = getProvider;
    this.getBriefer = getBriefer;
    this.id = null;
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.id) this.close(); });
  }

  open(id) {
    this.id = id;
    this.root.hidden = false;
    this.render();
  }

  close() {
    this.id = null;
    this.root.hidden = true;
    this.root.textContent = '';
  }

  // Called when a member's data or AI brief changes; re-render if it's open.
  refresh(id) {
    if (this.id != null && id === this.id) this.render();
  }

  render() {
    const m = this.getMember(this.id);
    if (!m) { this.close(); return; }
    const scroll = this.root.querySelector('.rmodal')?.scrollTop || 0;
    this.root.textContent = '';
    const box = el('div', 'modal-box rmodal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    const last = m.reports[m.reports.length - 1];
    // Header
    const head = el('div', 'rhead');
    const titleWrap = el('div', '');
    titleWrap.appendChild(el('div', 'label', 'Wellness report'));
    titleWrap.appendChild(el('h2', 'rtitle', m.name));
    head.appendChild(titleWrap);
    head.appendChild(el('span', 'spacer'));
    if (last?.simulated) head.appendChild(el('span', 'chip sim', 'SIMULATED'));
    head.appendChild(el('span', `chip ${m.left ? 'declined' : m.consent === 'granted' ? 'granted' : 'pending'}`,
      m.left ? 'Left meeting' : m.consent === 'granted' ? 'Live' : 'Not sharing'));
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

    // Vitals trends
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

    // Engagement signals
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
  }

  _aiPanel(m) {
    const providerId = this.getProvider();
    const provider = AI_PROVIDERS[providerId] || AI_PROVIDERS.off;
    const briefer = this.getBriefer();
    const history = briefer ? briefer.history(m.id) : [];
    const r = history[history.length - 1];
    const ai = el('div', 'rsection ai');
    const head = el('div', 'row');
    head.appendChild(el('div', 'rsection-title', '🤖 AI brief'));
    head.appendChild(el('span', 'spacer'));
    head.appendChild(el('span', 'chip sim', provider.label));
    const btn = el('button', 'small', briefer?.busy ? 'Analyzing…' : 'Brief now');
    btn.type = 'button';
    btn.disabled = !briefer || briefer.busy || providerId === 'off' || ['cooldown', 'capped'].includes(briefer.status);
    btn.addEventListener('click', () => { briefer.runNow(); this.render(); });
    head.appendChild(btn);
    ai.appendChild(head);

    const body = el('div', 'ai-body');
    if (providerId === 'off') body.appendChild(el('div', 'muted', 'AI insights are off. Choose a provider in ⚙ Settings.'));
    else if (!r) body.appendChild(el('div', 'ai-loading', 'Pixel is reading the reports… a brief appears within ~40 s.'));
    if (briefer && ['error', 'cooldown', 'capped'].includes(briefer.status)) body.appendChild(el('div', 'warn', briefer.message));

    if (r) {
      const top = el('div', 'ai-top');
      const gauge = el('div', `gauge lvl-${r.engagement?.level || 'unknown'}`);
      gauge.style.setProperty('--p', String(r.engagement?.score ?? 0));
      gauge.appendChild(el('span', 'gauge-val', r.engagement?.score == null ? '?' : String(r.engagement.score)));
      top.appendChild(gauge);
      const txt = el('div', 'ai-text');
      txt.appendChild(el('div', 'label', `Engagement · ${r.engagement?.level || 'unknown'} · ${new Date(r.at).toLocaleTimeString()}`));
      txt.appendChild(el('div', 'ai-headline', r.headline));
      txt.appendChild(el('div', 'ai-summary', r.summary));
      top.appendChild(txt);
      body.appendChild(top);
      const list = el('ul', 'ai-list');
      for (const s of [...(r.engagement?.reasons || []), ...(r.observations || [])]) list.appendChild(el('li', '', s));
      if (list.childNodes.length) body.appendChild(list);
      if (history.length > 1) {
        const prev = el('div', 'ai-prev');
        prev.appendChild(el('div', 'label', 'Earlier briefs'));
        for (const h of history.slice(0, -1).reverse().slice(0, 5)) {
          prev.appendChild(el('div', 'ai-prev-row', `${new Date(h.at).toLocaleTimeString()} · ${h.headline} · ${h.engagement?.level}${h.engagement?.score != null ? ` ${h.engagement.score}` : ''}`));
        }
        body.appendChild(prev);
      }
      body.appendChild(el('div', 'muted', CAVEAT + (r.source === 'preview' ? ' (Rule-based preview, not AI.)' : '')));
    }
    ai.appendChild(body);

    // Transparency: the exact anonymised data sent for this participant.
    const details = el('details', 'ai-data');
    details.open = !!this.detailsOpen;
    details.addEventListener('toggle', () => { this.detailsOpen = details.open; });
    details.appendChild(el('summary', '', `Data sent to ${provider.network ? provider.label : 'the analyzer'} (anonymised: no name, no video)`));
    details.appendChild(el('pre', '', JSON.stringify(buildMemberInput(m), null, 2)));
    ai.appendChild(details);
    return ai;
  }
}
