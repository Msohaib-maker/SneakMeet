import { EMOJI, SECS_PER_CREDIT, STATE_LABEL, el, fmtTime } from './helpers.js';
import { LEVELS } from '../vitals/calm-meter.js';
import { isRowdy } from '../ui/persona.js';
import { CALM_FACE, memeFace } from '../ui/meme-faces.js';
import { botTalk } from '../ui/bot-body.js';
import { speak } from '../ui/voice.js';

export const viewMethods = {
  _renderAll() { this._renderLive(); this._renderTimeline(); this._renderCoach(); this._renderClock(); },

  _renderClock() {
    const s = (Date.now() - this.session.startedAt) / 1000;
    this.ui.timer.textContent = fmtTime(s);
    const sim = this.latest?.m?.simulated;
    this.ui.credits.textContent = sim ? 'Simulated readings (demo numbers)'
      : `SDK use ~${Math.ceil(this.sdkSeconds / SECS_PER_CREDIT)} credits`;
  },

  _renderLive() {
    const est = this.latest?.est;
    const m = this.latest?.m;
    const b = est?.baseline;

    const vit = this.ui.vitals;
    vit.textContent = '';
    const cell = (cls, icon, label, value, unit, status, statusCls = '') => {
      const c = el('div', `p-vital ${cls}`);
      c.append(el('div', 'label', `${icon} ${label}`));
      const v = el('div', 'p-vital-v', Number.isFinite(value) ? String(Math.round(value)) : '—');
      v.appendChild(el('small', '', ` ${unit}`));
      c.append(v, el('div', `p-delta ${statusCls}`, status));
      vit.appendChild(c);
    };
    const vsUsual = (value, base, small, big) => {
      if (!Number.isFinite(value)) return ['measuring…', ''];
      if (!Number.isFinite(base)) return ['learning your usual', ''];
      const d = value - base;
      if (d > big) return ['↑ higher than usual', 'up'];
      if (d > small) return ['↑ a bit higher', 'up'];
      if (d < -small) return ['↓ lower than usual', 'down'];
      return ['≈ your usual', 'down'];
    };
    const weak = (good, raw) => !Number.isFinite(good) && Number.isFinite(raw);
    const weakNote = ['weak signal: light + sit still', 'weak'];
    cell(`pulse${weak(est?.pulse, m?.pulse) ? ' weak' : ''}`, '❤', 'Pulse', est?.pulse ?? m?.pulse, 'bpm',
      ...(weak(est?.pulse, m?.pulse) ? weakNote : vsUsual(est?.pulse, b?.pulse, 5, 12)));
    cell(`breath${weak(est?.breathing, m?.breathing) ? ' weak' : ''}`, '🫁', 'Breathing', est?.breathing ?? m?.breathing, '/min',
      ...(weak(est?.breathing, m?.breathing) ? weakNote : vsUsual(est?.breathing, b?.breathing, 2, 5)));
    cell('hrv', '〰', 'HRV', est?.hrv, 'ms', Number.isFinite(est?.hrv) ? 'higher = more relaxed' : 'needs ~1 min still');

    const g = this.ui.gauge;
    g.textContent = '';
    const lvl = est?.ready ? est.level : null;
    const stateEl = el('div', `p-state ${lvl ? lvl.id : 'unknown'}`, lvl ? lvl.label : 'Reading…');
    if (lvl && isRowdy()) stateEl.prepend(memeFace(CALM_FACE[lvl.id], { caption: false, cls: 'meme-md' }));
    g.append(el('div', 'label', 'How you seem right now'), stateEl);
    const bar = el('div', 'p-scale');
    for (const l of LEVELS) bar.appendChild(el('span', `seg ${l.id}`, l.label));
    if (lvl) {
      const marker = el('i', 'p-marker');
      marker.style.left = `${Math.max(0, Math.min(100, est.score))}%`;
      bar.appendChild(marker);
    }
    g.appendChild(bar);
    g.appendChild(el('div', 'p-why', !est?.ready ? 'Sit still and face the camera, about 20 seconds…'
      : est.calibrating ? 'Learning your usual pulse and breathing…' : (est.reasons[0] || '')));
    this.ui.chip.textContent = lvl ? lvl.label : '';
    this.ui.chip.className = `state-chip ${lvl ? lvl.id : ''}`;
    this.ui.chip.hidden = !lvl;

    const ex = est?.expressions;
    const top = ex ? Object.entries(ex).sort((a, c) => c[1] - a[1])[0] : null;
    this.ui.expr.hidden = !top;
    this.ui.expr.classList.toggle('meme-chip', !!top && isRowdy());
    if (top && isRowdy()) {
      if (this.ui.expr.dataset.face !== top[0]) this.ui.expr.replaceChildren(memeFace(top[0]));
      this.ui.expr.dataset.face = top[0];
    } else if (top) {
      this.ui.expr.textContent = `${EMOJI[top[0]] || ''} ${top[0]}`;
      this.ui.expr.dataset.face = '';
    }

    const f = m?.face;
    this.ui.face.textContent = !f ? '' : !f.present ? 'No face found: centre yourself in the frame.' : !f.forward ? 'Look at the camera.' : '';
  },

  _renderTimeline() {
    const t = this.ui.timeline;
    t.textContent = '';
    const ws = this.session.windows;
    if (!ws.length) return;
    t.appendChild(el('span', 'muted p-tl-label', 'Your session:'));
    for (const w of ws) {
      const seg = el('span', `p-seg ${w.calm?.id || 'none'}`);
      seg.title = `${fmtTime((w.at - this.session.startedAt) / 1000)} · ${w.calm ? w.calm.label : 'no reading'}`;
      t.appendChild(seg);
    }
  },

  _renderCoach() {
    const box = this.ui.coach;
    box.textContent = '';
    const list = [...this.messages].reverse();
    const [latest, ...older] = list;
    if (!latest) return;
    const card = el('div', `p-msg ${latest.state}`);
    const head = el('div', 'p-msg-head');
    head.append(el('b', '', latest.headline || STATE_LABEL[latest.state]),
      el('span', 'p-src', latest.source === 'gemini' ? '✦ Gemini' : ''));
    card.appendChild(head);
    if (latest.feedback) card.appendChild(el('div', 'p-msg-body', latest.feedback));
    if (latest.tip) card.appendChild(el('div', 'p-msg-tip', `💡 ${latest.tip}`));
    box.appendChild(card);
    this._speak(latest);
    const earlier = older.filter((x) => x.source === 'gemini');
    if (earlier.length) {
      const d = el('details', 'p-earlier');
      d.appendChild(el('summary', '', `Earlier tips (${earlier.length})`));
      for (const x of earlier.slice(0, 8)) d.appendChild(el('div', `p-old ${x.state}`, `${fmtTime((x.at - this.session.startedAt) / 1000)} · ${x.tip || x.headline}`));
      box.appendChild(d);
    }
  },

  _speak(msg) {
    const b = this.ui.bubble;
    if (!b) return;
    b.textContent = '';
    b.append(el('b', '', msg.headline || STATE_LABEL[msg.state]), el('div', '', msg.tip || msg.feedback || ''));
    b.hidden = false;
    if (this._spoken !== msg) {
      this._spoken = msg;
      botTalk(this.ui.bot);
      speak([msg.headline, msg.feedback, msg.tip].filter(Boolean).join('. '), this.ui.bot);
    }
  },
};
