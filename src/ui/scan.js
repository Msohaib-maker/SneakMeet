import { WARMUP } from '../vitals/vitals.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const METRICS = [
  ['pulse', 'PULSE', WARMUP.pulse],
  ['breathing', 'RESP', WARMUP.breathing],
  ['hrv', 'HRV', WARMUP.hrv],
];

export class ScanOverlay {
  constructor(container, { compact = false, ambient = false } = {}) {
    this.compact = compact;
    this.ambient = ambient;
    if (ambient) {
      this.root = el('div', 'scan ambient');
      this.root.append(el('div', 'scan-grid'), el('div', 'scan-line'),
        el('i', 'corner tl'), el('i', 'corner tr'), el('i', 'corner bl'), el('i', 'corner br'));
      container.appendChild(this.root);
      return;
    }
    this.root = el('div', `scan idle${compact ? ' compact' : ''}`);
    this.root.append(el('i', 'corner tl'), el('i', 'corner tr'), el('i', 'corner bl'), el('i', 'corner br'));
    if (!compact) {
      this.root.prepend(el('div', 'scan-grid'), el('div', 'scan-line'));
      const reticle = el('div', 'reticle');
      reticle.append(el('div', 'reticle-ring'), el('div', 'reticle-ring r2'));
      this.root.appendChild(reticle);
    }
    this.title = el('div', 'scan-title', 'SCANNER READY');
    this.bars = el('div', 'scan-bars');
    this.rows = {};
    for (const [key, label] of METRICS) {
      const row = el('div', 'scan-row');
      const fill = el('div', 'scan-fill');
      const bar = el('div', 'scan-bar');
      bar.appendChild(fill);
      const val = el('span', 'scan-val', '—');
      row.append(el('span', 'scan-key', label), bar, val);
      this.bars.appendChild(row);
      this.rows[key] = { row, fill, val };
    }
    this.bars.prepend(this.title);
    if (!compact) this.root.appendChild(this.title);
    this.root.appendChild(this.bars);
    container.appendChild(this.root);
  }

  update({ measuring, simulated, my, calm }) {
    if (this.ambient) return;
    if (this.compact) {
      this.bars.hidden = false;
      for (const r of Object.values(this.rows)) r.row.hidden = true;
      this.root.classList.toggle('idle', false);
      const sim = simulated ? ' · SIM' : '';
      this.title.className = `scan-title hud-state ${measuring && calm ? calm.id : ''}`;
      this.title.textContent = !measuring ? 'NOT MEASURING'
        : my?.face && !my.face.present ? 'NO FACE'
          : calm ? `● ${calm.label.toUpperCase()}${sim}` : `READING…${sim}`;
      return;
    }
    const elapsed = my?.elapsed ?? 0;
    const locked = measuring && METRICS.every(([key, , w]) => my?.[key] != null && elapsed >= w);
    this.root.classList.toggle('idle', !measuring);
    this.root.classList.toggle('active', measuring && !locked);
    this.root.classList.toggle('locked', locked);
    this.root.classList.toggle('noface', measuring && my?.face && !my.face.present);

    const sim = simulated ? (this.compact ? ' · SIM' : ' · SIMULATED') : '';
    if (!measuring) this.title.textContent = this.compact ? 'NOT MEASURING' : 'SCANNER READY · press Measure';
    else if (my?.face && !my.face.present) this.title.textContent = 'NO FACE';
    else if (locked) this.title.textContent = `LOCKED${sim}`;
    else this.title.textContent = `SCANNING${sim} · ${Math.floor(elapsed)}s`;

    this.bars.hidden = !measuring && !this.compact;
    for (const [key, , warm] of METRICS) {
      const r = this.rows[key];
      const p = Math.min(1, elapsed / warm);
      r.fill.style.width = `${Math.round(p * 100)}%`;
      const v = my?.[key];
      r.row.classList.toggle('done', p >= 1 && v != null);
      r.val.textContent = v == null ? `${Math.round(p * 100)}%` : String(Math.round(v));
    }
  }

  destroy() { this.root.remove(); }
}
