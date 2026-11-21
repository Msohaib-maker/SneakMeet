import { CalmMeter, levelFor } from '../vitals/calm-meter.js';
import { ReportBuilder } from '../vitals/reports.js';
import {
  COACH_INTERVAL_MS,
  SECS_PER_CREDIT,
  calls,
  fmtTime,
  holdingMessage,
  r0,
} from './helpers.js';
import { SCENARIOS, coachLive, coachSummary } from '../ai/coach-ai.js';
import { RateLimitError, TransientError } from '../ai/gemini.js';
import { DAILY_CAP } from '../ai/ai-brief.js';
import { exportMethods } from './export.js';
import { viewMethods } from './view.js';
import { detailsMethods } from './details.js';

import { setBodyBotMood } from '../ui/bot-body.js';
import { isRowdy } from '../ui/persona.js';

export class PracticeSession {
  constructor({ ui, scenario, instructions, getProvider, getApiKey, log }) {
    Object.assign(this, { ui, getProvider, getApiKey, log });
    this.session = { scenario, instructions: instructions || '', startedAt: Date.now(), baseline: null, windows: [], tips: [] };
    this.calm = new CalmMeter();
    this.builder = new ReportBuilder();
    this.windowScores = [];
    this.messages = [];
    this.sdkSeconds = 0;
    this.lastFeedAt = 0;
    this.latest = null;
    this.busy = false;
    this.backoffUntil = 0;
    this.abort = null;
    this.ended = false;
    this.ui.coachStatus.textContent = '';
    this.windowTimer = setInterval(() => this._closeWindow(), COACH_INTERVAL_MS);
    this.clock = setInterval(() => this._renderClock(), 1000);
    this._renderAll();
    this._addMessage(holdingMessage('intro', isRowdy()));
  }

  get scenarioLabel() { return (SCENARIOS[this.session.scenario] || SCENARIOS.custom).label; }

  feed(m) {
    if (this.ended) return;
    const now = Date.now();
    if (!m.simulated && this.lastFeedAt && now - this.lastFeedAt < 3000) this.sdkSeconds += (now - this.lastFeedAt) / 1000;
    this.lastFeedAt = now;
    this.builder.add(m);
    const est = this.calm.add(m);
    this.latest = { m, est };
    if (est.ready && Number.isFinite(est.score)) this.windowScores.push(est.score);
    if (est.baseline) this.session.baseline = est.baseline;
    if (now - (this.paintedAt || 0) >= 500) { this.paintedAt = now; this._renderLive(); }
    if (now - (this.detailsAt || 0) >= 300) { this.detailsAt = now; this._renderDetails(); }
  }

  vitalsStopped(reason) {
    this.lastFeedAt = 0;
    this.ui.face.textContent = reason || 'Readings paused.';
  }

  recalibrate() {
    this.calm.recalibrate();
    this.session.baseline = null;
    this.log?.('Practice: baseline will be re-learned from the next stable readings.');
    this._renderLive();
  }

  coachNow() {
    if (this.busy) return;
    this._closeWindow(true);
  }

  async finish() {
    if (this.ended) return null;
    this._closeWindow(false, true);
    this.ended = true;
    clearInterval(this.windowTimer);
    clearInterval(this.clock);
    this.abort?.abort();
    const provider = this._provider();
    let summary;
    try {
      if (provider === 'gemini') calls.inc();
      try {
        summary = await coachSummary(provider, this.session, { apiKey: this.getApiKey() });
      } catch (e) {
        if (!(e instanceof TransientError || e instanceof TypeError)) throw e;
        await new Promise((r) => setTimeout(r, 4000));
        summary = await coachSummary(provider, this.session, { apiKey: this.getApiKey() });
      }
      summary.source = provider;
    } catch (e) {
      this.log?.(`Coach summary: ${e.message}. Using the offline summary.`);
      summary = { ...(await coachSummary('preview', this.session)), source: 'preview' };
    }
    this.summary = summary;
    this.log?.(`Practice debrief (${summary.source}): [${summary.state}] ${summary.headline} | SDK time ${fmtTime(this.sdkSeconds)} (~${Math.ceil(this.sdkSeconds / SECS_PER_CREDIT)} credits)`);
    return summary;
  }

  destroy() {
    this.ended = true;
    clearInterval(this.windowTimer);
    clearInterval(this.clock);
    this.abort?.abort();
  }

  _provider() {
    const p = this.getProvider();
    return p === 'gemini' ? 'gemini' : p === 'off' ? 'off' : 'preview';
  }

  _closeWindow(force = false, final = false) {
    const report = this.builder.build({ measuring: !!this.latest, simulated: !!this.latest?.m?.simulated });
    const scores = this.windowScores;
    this.windowScores = [];
    if (!report.samples) {
      if (force) this._setCoachStatus('No new readings yet. Turn on readings and face the camera.');
      return;
    }
    if (scores.length) {
      const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const lvl = levelFor(score);
      report.calm = { id: lvl.id, label: lvl.label, score, reasons: this.latest?.est?.reasons?.slice(0, 3) || [] };
    }
    this.session.windows.push(report);
    const t = fmtTime((Date.now() - this.session.startedAt) / 1000);
    const top = report.face?.expressions ? Object.entries(report.face.expressions).sort((a, b) => b[1] - a[1])[0] : null;
    this.log?.(`Practice ${t}: ${report.calm ? `${report.calm.label} (${report.calm.score})` : 'no calm reading'}, pulse ${r0(report.pulse?.avg)}, breathing ${r0(report.breathing?.avg)}, HRV ${r0(report.hrv)}, quality ${r0(report.quality)}%, ${top ? `mostly ${top[0]} ${r0(top[1])}%` : 'no expressions'}${report.simulated ? ' (simulated)' : ''}`);
    this._renderTimeline();
    if (!final) this._coach(force);
  }

  _hold() {
    if (this.messages[this.messages.length - 1]?.source === 'holding') return;
    this._addMessage(holdingMessage('wait', isRowdy()));
  }

  async _coach(force = false) {
    const provider = this._provider();
    if (this.busy || this.ended) return;
    if (provider !== 'gemini') { this._hold(); this._setCoachStatus('Feedback comes from Gemini: choose it in ⚙ AI.'); return; }
    if (Date.now() < this.backoffUntil) { if (force) this._hold(); this._setCoachStatus('Gemini is cooling down (free-tier limit)…'); return; }
    if (calls.get() >= DAILY_CAP) { this._hold(); this._setCoachStatus(`Daily AI limit (${DAILY_CAP}) reached.`); return; }
    const useProvider = 'gemini';
    this.busy = true;
    this._setCoachStatus(useProvider === 'gemini' ? 'Coach is thinking…' : '');
    this.abort = new AbortController();
    try {
      if (useProvider === 'gemini') calls.inc();
      const msg = await coachLive(useProvider, this.session, { apiKey: this.getApiKey(), signal: this.abort.signal });
      if (this.ended) return;
      this.session.tips.push(msg.tip);
      this._addMessage({ ...msg, source: useProvider });
      this.log?.(`Coach (${useProvider}): [${msg.state}] ${msg.headline} | tip: ${msg.tip}`);
      this._setCoachStatus('');
    } catch (e) {
      if (e.name === 'AbortError' || this.ended) return;
      if (e instanceof RateLimitError) this.backoffUntil = Date.now() + Math.max(60000, e.retryMs || 0);
      else if (e instanceof TransientError || e instanceof TypeError) this.backoffUntil = Date.now() + 20000;
      this.log?.(`Coach: ${e.message}`);
      this._hold();
      const why = e instanceof RateLimitError ? 'free-tier limit' : e instanceof TransientError ? 'Gemini busy' : e instanceof TypeError ? 'network error' : e.message.slice(0, 80);
      this._setCoachStatus(`Gemini unavailable (${why}), will retry.`);
    } finally {
      this.busy = false;
      this.abort = null;
    }
  }

  _setCoachStatus(text) {
    this.ui.coachStatus.textContent = text;
    const bot = this.ui.bot;
    if (/thinking/i.test(text)) setBodyBotMood(bot, 'thinking');
    else if (bot && !bot.classList.contains('talking')) setBodyBotMood(bot, 'idle');
  }

  _addMessage(msg) {
    msg.at = Date.now();
    this.messages.push(msg);
    if (this.messages.length > 40) this.messages.shift();
    this._renderCoach();
  }
}

Object.assign(PracticeSession.prototype, exportMethods);
Object.assign(PracticeSession.prototype, viewMethods);
Object.assign(PracticeSession.prototype, detailsMethods);
