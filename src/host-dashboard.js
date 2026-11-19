// Host dashboard: one card per participant showing consent status and the
// periodic wellness reports they send (only after they consent).

const CONSENT_LABELS = {
  pending: ['Waiting for consent', 'pending'],
  granted: ['Sharing reports', 'granted'],
  declined: ['Declined', 'declined'],
  revoked: ['Stopped sharing', 'declined'],
};
const MAX_HISTORY = 60;

const num = (n) => (n == null || !Number.isFinite(Number(n)) ? null : Number(n));
const fmt = (n) => (n == null ? '—' : String(Math.round(n)));
const range = (s) => (s ? { avg: num(s.avg), min: num(s.min), max: num(s.max) } : null);
const pct = (n) => (num(n) == null ? null : Math.max(0, Math.min(100, num(n))));
const EXPRESSION_KEYS = ['neutral', 'happy', 'surprise', 'sad', 'angry', 'fear', 'disgust', 'contempt'];

function sanitizeFace(f) {
  if (!f || typeof f !== 'object') return null;
  let expressions = null;
  if (f.expressions && typeof f.expressions === 'object') {
    expressions = {};
    for (const k of EXPRESSION_KEYS) if (pct(f.expressions[k]) != null) expressions[k] = pct(f.expressions[k]);
  }
  return {
    presentPct: pct(f.presentPct),
    facingPct: pct(f.facingPct),
    talkingPct: pct(f.talkingPct),
    blinksPerMin: num(f.blinksPerMin) == null ? null : Math.max(0, Math.min(120, num(f.blinksPerMin))),
    expressions,
  };
}

// Accept only the known numeric fields from a peer's report.
function sanitizeReport(r) {
  return {
    at: Date.now(),
    measuring: !!r.measuring,
    simulated: !!r.simulated,
    samples: num(r.samples) ?? 0,
    pulse: range(r.pulse),
    breathing: range(r.breathing),
    hrv: num(r.hrv),
    quality: Math.max(0, Math.min(100, num(r.quality) ?? 0)),
    trend: { pulse: num(r.trend?.pulse), breathing: num(r.trend?.breathing) },
    face: sanitizeFace(r.face),
  };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function topExpression(face) {
  const e = face?.expressions;
  if (!e) return '';
  const top = Object.entries(e).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : '';
}

const EMOJI = { happy: '😊', neutral: '😐', surprise: '😮', sad: '😔', angry: '😠', fear: '😨', disgust: '😖', contempt: '😏' };

function trendText(d) {
  if (d == null || Math.abs(d) < 1) return '';
  return d > 0 ? ` ↑${Math.round(d)}` : ` ↓${Math.round(-d)}`;
}

export class HostDashboard {
  // onOpen(id): host clicked "Open report"; onChange(id): a member's data changed.
  // onOpen(id), onDownload(id): card buttons; onChange(id): data changed;
  // getBrief(id): latest AI brief for the compact card.
  constructor(container, { onOpen, onChange, onDownload, getBrief } = {}) {
    this.el = container;
    Object.assign(this, { onOpen, onChange, onDownload, getBrief });
    this.members = new Map();
    this.timer = setInterval(() => this._refreshAges(), 1000);
    this.render();
  }

  addMember(id, name) {
    if (!this.members.has(id)) this.members.set(id, { id, name, consent: 'pending', reports: [], left: false });
    else this.members.get(id).left = false;
    this.render();
  }

  memberLeft(id) {
    const m = this.members.get(id);
    if (m) { m.left = true; this.render(); this.onChange?.(id); }
  }

  getMember(id) { return this.members.get(id) || null; }
  list() { return [...this.members.values()]; }

  setConsent(id, status) {
    const m = this.members.get(id);
    if (!m || !CONSENT_LABELS[status]) return;
    m.consent = status;
    this.render();
    this.onChange?.(id);
  }

  addReport(id, report) {
    const m = this.members.get(id);
    if (!m || m.consent !== 'granted') return; // ignore reports without consent
    m.reports.push(sanitizeReport(report));
    if (m.reports.length > MAX_HISTORY) m.reports.shift();
    this.render();
    this.onChange?.(id);
  }

  toCsv() {
    const rows = [['participant', 'time', 'simulated', 'measuring', 'pulse_avg', 'pulse_min', 'pulse_max',
      'breathing_avg', 'breathing_min', 'breathing_max', 'hrv_rmssd_ms', 'signal_quality_pct', 'samples',
      'face_present_pct', 'facing_screen_pct', 'talking_pct', 'blinks_per_min', 'top_expression']];
    for (const m of this.members.values()) {
      for (const r of m.reports) {
        rows.push([m.name, new Date(r.at).toISOString(), r.simulated, r.measuring,
          r.pulse?.avg, r.pulse?.min, r.pulse?.max, r.breathing?.avg, r.breathing?.min, r.breathing?.max,
          r.hrv, r.quality, r.samples, r.face?.presentPct, r.face?.facingPct, r.face?.talkingPct,
          r.face?.blinksPerMin, topExpression(r.face)]);
      }
    }
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return rows.map((r) => r.map(esc).join(',')).join('\n');
  }

  get reportCount() {
    let n = 0;
    for (const m of this.members.values()) n += m.reports.length;
    return n;
  }

  destroy() {
    clearInterval(this.timer);
    this.el.textContent = '';
  }

  _refreshAges() {
    for (const node of this.el.querySelectorAll('[data-at]')) {
      const secs = Math.round((Date.now() - Number(node.dataset.at)) / 1000);
      node.textContent = `updated ${secs}s ago`;
    }
  }

  render() {
    this.el.textContent = '';
    if (!this.members.size) {
      this.el.appendChild(el('div', 'muted', 'No participants yet. Reports appear here after a participant consents.'));
      return;
    }
    for (const m of this.members.values()) this.el.appendChild(this._card(m));
  }

  _card(m) {
    const card = el('div', 'hcard' + (m.left ? ' left' : ''));
    const head = el('div', 'hcard-head');
    head.appendChild(el('span', 'hcard-name', m.name));
    const [label, cls] = m.left ? ['Left', 'declined'] : CONSENT_LABELS[m.consent];
    head.appendChild(el('span', `chip ${cls}`, label));
    const r = m.reports[m.reports.length - 1];
    if (r) {
      const dl = el('button', 'secondary small icon-btn', '⬇');
      dl.type = 'button';
      dl.title = `Download ${m.name}'s report card`;
      dl.addEventListener('click', () => this.onDownload?.(m.id));
      const open = el('button', 'secondary small icon-btn', '›');
      open.type = 'button';
      open.title = 'Open full report';
      open.addEventListener('click', () => this.onOpen?.(m.id));
      head.append(dl, open);
    }
    card.appendChild(head);

    if (!r) {
      card.appendChild(el('div', 'muted',
        m.consent === 'granted' ? 'First report in ~25 s…' : m.consent === 'pending' ? 'Asked for consent…' : 'Not sharing.'));
      return card;
    }

    // One-line vitals strip.
    const strip = el('div', 'hstrip');
    const item = (text, title) => { const s = el('span', '', text); if (title) s.title = title; strip.appendChild(s); };
    item(`❤ ${fmt(r.pulse?.avg)}${trendText(r.trend.pulse)}`, 'Pulse, bpm');
    item(`🫁 ${fmt(r.breathing?.avg)}`, 'Breathing, /min');
    item(`HRV ${fmt(r.hrv)}`, 'HRV RMSSD, ms');
    if (r.face?.facingPct != null) item(`👀 ${Math.round(r.face.facingPct)}%`, 'Facing the screen');
    if (r.face?.expressions) item(EMOJI[topExpression(r.face)] || '🙂', `Mostly ${topExpression(r.face)}`);
    card.appendChild(strip);

    // AI brief.
    const b = this.getBrief?.(m.id);
    const ai = el('div', 'hbrief');
    if (b) {
      const top = el('div', 'hbrief-top');
      top.appendChild(el('span', 'hbrief-bot', '🤖'));
      top.appendChild(el('span', 'hbrief-headline', b.headline));
      const lvl = b.engagement?.level || 'unknown';
      top.appendChild(el('span', `eng eng-${lvl}`, lvl === 'unknown' ? '?' : `${lvl} ${b.engagement.score}`));
      ai.appendChild(top);
      ai.appendChild(el('div', 'hbrief-sum', b.summary));
    } else {
      ai.appendChild(el('div', 'muted', '🤖 Pixel is reading the first reports…'));
    }
    card.appendChild(ai);

    const meta = el('div', 'hmeta');
    if (!r.measuring) meta.appendChild(el('span', 'warn', 'not measuring'));
    meta.appendChild(el('span', '', `quality ${r.quality}%`));
    const age = el('span', '', 'updated 0s ago');
    age.dataset.at = String(r.at);
    meta.appendChild(age);
    if (r.simulated) meta.appendChild(el('span', 'chip sim', 'SIM'));
    card.appendChild(meta);
    return card;
  }
}
