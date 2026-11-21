import {
  CONSENT_LABELS,
  MAX_HISTORY,
  STATE_EMOJI,
  el,
  sanitizeReport,
  topExpression,
} from './dashboard-data.js';
import { makeBot, setBotMood } from './host-ai.js';

import { isRowdy } from '../ui/persona.js';
import { CALM_FACE, memeFace } from '../ui/meme-faces.js';

export class HostDashboard {
  constructor(container, { onOpen, onChange, getBrief, onBrief, isBriefing } = {}) {
    this.el = container;
    Object.assign(this, { onOpen, onChange, getBrief, onBrief, isBriefing });
    this.members = new Map();
    this.cards = new Map();
    this.render();
  }

  addMember(id, name) {
    if (!this.members.has(id)) this.members.set(id, { id, name, consent: 'pending', reports: [], left: false, live: null, liveAt: 0 });
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
    if (!m || m.consent !== 'granted') return;
    m.reports.push(sanitizeReport(report));
    if (m.reports.length > MAX_HISTORY) m.reports.shift();
    this.render();
    this.onChange?.(id);
  }

  setLive(id, calm) {
    const m = this.members.get(id);
    if (!m || m.consent !== 'granted') return;
    m.live = calm;
    m.liveAt = Date.now();
    this._paintState(id);
  }

  stateOf(m) {
    if (m.live && Date.now() - m.liveAt < 5000) return m.live;
    return m.reports[m.reports.length - 1]?.calm || null;
  }

  refreshBots() {
    for (const [id, c] of this.cards) {
      const m = this.members.get(id);
      if (!m) continue;
      setBotMood(c.bot, this.isBriefing?.(id) ? 'thinking' : this.getBrief?.(id) ? 'happy' : 'idle');
      c.botBtn.disabled = !m.reports.length || m.consent !== 'granted' || !!this.isBriefing?.(id);
    }
  }

  toCsv() {
    const rows = [['participant', 'time', 'simulated', 'measuring', 'state', 'state_score', 'pulse_avg', 'pulse_min', 'pulse_max',
      'breathing_avg', 'breathing_min', 'breathing_max', 'hrv_rmssd_ms', 'signal_quality_pct', 'samples',
      'face_present_pct', 'facing_screen_pct', 'talking_pct', 'blinks_per_min', 'top_expression',
      'beat_gap_ms', 'sdnn_ms', 'stress_index', 'breathing_style']];
    for (const m of this.members.values()) {
      for (const r of m.reports) {
        rows.push([m.name, new Date(r.at).toISOString(), r.simulated, r.measuring, r.calm?.label, r.calm?.score,
          r.pulse?.avg, r.pulse?.min, r.pulse?.max, r.breathing?.avg, r.breathing?.min, r.breathing?.max,
          r.hrv, r.quality, r.samples, r.face?.presentPct, r.face?.facingPct, r.face?.talkingPct,
          r.face?.blinksPerMin, topExpression(r.face), r.heart?.beatGapMs, r.heart?.sdnnMs, r.heart?.stressIndex, r.breathStyle]);
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
    this.el.textContent = '';
    this.cards.clear();
  }

  render() {
    this.el.textContent = '';
    this.cards.clear();
    if (!this.members.size) {
      this.el.appendChild(el('div', 'muted', 'No participants yet.'));
      return;
    }
    for (const m of this.members.values()) this.el.appendChild(this._card(m));
    this.refreshBots();
  }

  _paintState(id) {
    const c = this.cards.get(id);
    const m = this.members.get(id);
    if (!c || !m || m.consent !== 'granted' || m.left) return;
    const s = this.stateOf(m);
    c.state.textContent = s ? `${STATE_EMOJI[s.id] || ''} ${s.label}` : 'Reading…';
    if (s && isRowdy()) c.state.replaceChildren(memeFace(CALM_FACE[s.id], { caption: false, cls: 'meme-xs' }), ` ${s.label}`);
    c.state.className = `hstate ${s ? s.id : 'unknown'}`;
  }

  _card(m) {
    const card = el('div', 'hcard' + (m.left ? ' left' : ''));
    const row = el('div', 'hcard-head');
    row.appendChild(el('span', 'hcard-name', m.name));

    const state = el('span', 'hstate unknown');
    if (m.left) { state.textContent = 'Left'; state.className = 'chip declined'; }
    else if (m.consent !== 'granted') {
      const [label, cls] = CONSENT_LABELS[m.consent];
      state.textContent = label;
      state.className = `chip ${cls}`;
    }
    row.appendChild(state);

    const bot = makeBot();
    const botBtn = el('button', 'botbtn');
    botBtn.type = 'button';
    botBtn.title = m.reports.length ? `Summarise ${m.name}'s readings` : 'First readings arrive ~25 s after they agree to share';
    botBtn.appendChild(bot);
    botBtn.addEventListener('click', () => this.onBrief?.(m.id));
    row.appendChild(botBtn);

    const open = el('button', 'secondary small icon-btn', '›');
    open.type = 'button';
    open.title = 'Full report (numbers, history, AI briefs)';
    open.disabled = !m.reports.length;
    open.addEventListener('click', () => this.onOpen?.(m.id));
    row.appendChild(open);
    card.appendChild(row);

    const b = this.getBrief?.(m.id);
    const last = m.reports[m.reports.length - 1];
    if (b) {
      const brief = el('div', 'hbrief-card');
      const sum = el('div', 'hsum', b.summary);
      sum.title = b.summary;
      brief.append(el('div', 'hline', b.headline), sum);
      card.appendChild(brief);
    } else if (m.consent === 'granted' && !m.left && !last) {
      card.appendChild(el('div', 'hline muted', 'Starting…'));
    }
    if (last?.simulated) card.querySelector('.hcard-name').appendChild(el('span', 'chip sim', 'SIM'));

    this.cards.set(m.id, { state, bot, botBtn });
    this._paintState(m.id);
    return card;
  }
}
