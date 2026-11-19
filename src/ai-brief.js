// Host-side AI scheduler. Every BRIEF_INTERVAL_MS it sends ONE batched request
// covering all consenting participants that have new reports. Free-tier
// friendly by design:
//   - one call per cycle for the whole room (not per person)
//   - skipped entirely when no new reports arrived
//   - daily call cap (persisted per day)
//   - on 429, waits Google's retryDelay (or exponential backoff) before retrying
import { generateBriefs, RateLimitError, TransientError, AI_PROVIDERS, buildMemberInput } from './insights.js';

export const BRIEF_INTERVAL_MS = 40000;
export const DAILY_CAP = 300;
const MAX_HISTORY = 20;

const today = () => new Date().toISOString().slice(0, 10);
const store = {
  get(k) { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch { /* unavailable */ } },
};

export class AIBriefer {
  // getMembers() -> dashboard members; getConfig() -> { provider, apiKey }
  // onUpdate(changedIds) after briefs/status change; log(msg)
  constructor({ getMembers, getConfig, onUpdate, onStatus, log }) {
    Object.assign(this, { getMembers, getConfig, onUpdate, onStatus, log });
    this.briefs = new Map();      // memberId -> [{ at, source, ...brief }]
    this.seen = new Map();        // memberId -> report count included in last brief
    this.status = 'idle';         // idle | waiting | thinking | done | cooldown | capped | error | off
    this.message = '';
    this.nextAt = Date.now() + 15000; // first brief once a report or two has arrived
    this.backoffMs = 0;
    this.busy = false;
    this.abort = null;
    this.timer = setInterval(() => this._tick(), 1000);
  }

  get callsToday() { return store.get(`aiCalls:${today()}`); }

  latest(id) { const h = this.briefs.get(id); return h ? h[h.length - 1] : null; }
  history(id) { return this.briefs.get(id) || []; }

  // Manual "Brief now": runs at the next tick unless cooling down / capped.
  runNow() {
    if (this.status === 'cooldown' || this.status === 'capped') return;
    this.nextAt = Date.now();
    this.seen.clear(); // force a fresh brief even without new reports
  }

  destroy() {
    clearInterval(this.timer);
    this.abort?.abort();
  }

  _setStatus(status, message = '') {
    this.status = status;
    this.message = message;
    this.onStatus?.();
  }

  _tick() {
    if (!this.busy && Date.now() >= this.nextAt) this._cycle();
    else this.onStatus?.(); // countdown refresh
  }

  async _cycle() {
    const { provider, apiKey } = this.getConfig();
    if (provider === 'off' || !AI_PROVIDERS[provider]) {
      this.nextAt = Date.now() + 5000;
      this._setStatus('off', 'AI insights are off (⚙ Settings).');
      return;
    }
    // Who has new reports since their last brief?
    const fresh = this.getMembers().filter((m) => m.consent === 'granted' && !m.left
      && m.reports.length && m.reports.length !== this.seen.get(m.id));
    if (!fresh.length) {
      this.nextAt = Date.now() + BRIEF_INTERVAL_MS;
      const any = this.getMembers().some((m) => m.consent === 'granted' && !m.left);
      this._setStatus('waiting', any ? 'Waiting for new readings…' : 'Waiting for participants to share…');
      return;
    }
    const network = AI_PROVIDERS[provider].network;
    if (network && this.callsToday >= DAILY_CAP) {
      this.nextAt = Date.now() + 10 * 60000;
      this._setStatus('capped', `Daily AI limit reached (${DAILY_CAP}). Resting until tomorrow.`);
      return;
    }

    // Anonymous refs: the AI never sees names.
    const entries = fresh.map((m, i) => ({ ref: `P${i + 1}`, member: m, input: buildMemberInput(m) }));
    this.busy = true;
    this._setStatus('thinking', `Analyzing ${entries.length} participant${entries.length > 1 ? 's' : ''}…`);
    this.abort = new AbortController();
    try {
      if (network) store.set(`aiCalls:${today()}`, this.callsToday + 1);
      const out = await generateBriefs(provider, entries, { apiKey, signal: this.abort.signal });
      const changed = [];
      for (const e of entries) {
        const b = out[e.ref];
        if (!b) continue;
        const h = this.briefs.get(e.member.id) || [];
        h.push({ ...b, at: Date.now(), source: provider, simulated: e.input.simulated });
        if (h.length > MAX_HISTORY) h.shift();
        this.briefs.set(e.member.id, h);
        this.seen.set(e.member.id, e.member.reports.length);
        changed.push(e.member.id);
      }
      this.backoffMs = 0;
      this.nextAt = Date.now() + BRIEF_INTERVAL_MS;
      this._setStatus('done', `Briefed ${changed.length} participant${changed.length === 1 ? '' : 's'}.`);
      this.onUpdate?.(changed);
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (e instanceof RateLimitError) {
        this.backoffMs = Math.min(10 * 60000, Math.max(60000, this.backoffMs * 2 || 60000, e.retryMs || 0));
        this.nextAt = Date.now() + this.backoffMs;
        this._setStatus('cooldown', `Free-tier limit hit, cooling down ${Math.round(this.backoffMs / 1000)}s.`);
      } else if (e instanceof TransientError || e instanceof TypeError) {
        // Server busy / network blip: retry soon, backing off 20 s -> 5 min.
        this.backoffMs = Math.min(5 * 60000, Math.max(20000, this.backoffMs * 2 || 20000));
        this.nextAt = Date.now() + this.backoffMs;
        this._setStatus('cooldown', `${e instanceof TypeError ? 'Network error' : e.message.replace(/, retrying.*/, '')}, retrying in ${Math.round(this.backoffMs / 1000)}s.`);
      } else {
        this.nextAt = Date.now() + 2 * 60000;
        this._setStatus('error', e.message);
      }
      this.log?.(`AI: ${e.message}`);
    } finally {
      this.busy = false;
      this.abort = null;
    }
  }
}
