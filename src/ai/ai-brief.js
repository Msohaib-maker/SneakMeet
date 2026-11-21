import { AI_PROVIDERS, buildMemberInput, generateBriefs } from './insights.js';
import { RateLimitError, TransientError } from './gemini.js';

export const BRIEF_INTERVAL_MS = 40000;
export const DAILY_CAP = 300;
const MAX_HISTORY = 20;

const today = () => new Date().toISOString().slice(0, 10);
const store = {
  get(k) { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch {} },
};

export class AIBriefer {
  constructor({ getMembers, getConfig, onUpdate, onStatus, log, auto = false }) {
    Object.assign(this, { getMembers, getConfig, onUpdate, onStatus, log, auto });
    this.pending = new Set();
    this.inFlight = new Set();
    this.briefs = new Map();
    this.seen = new Map();
    this.status = 'idle';
    this.message = '';
    this.nextAt = auto ? Date.now() + 15000 : Infinity;
    this.backoffMs = 0;
    this.busy = false;
    this.abort = null;
    this.timer = setInterval(() => this._tick(), 1000);
  }

  get callsToday() { return store.get(`aiCalls:${today()}`); }

  latest(id) { const h = this.briefs.get(id); return h ? h[h.length - 1] : null; }
  history(id) { return this.briefs.get(id) || []; }

  request(id) {
    if (this.status === 'cooldown' || this.status === 'capped') return false;
    const m = this.getMembers().find((x) => x.id === id);
    if (!m || m.consent !== 'granted' || !m.reports.length) return false;
    this.pending.add(id);
    this.seen.delete(id);
    this.nextAt = Date.now();
    this.onStatus?.();
    return true;
  }

  isWorkingOn(id) { return this.pending.has(id) || this.inFlight.has(id); }

  runNow() {
    if (this.status === 'cooldown' || this.status === 'capped') return;
    this.nextAt = Date.now();
    this.seen.clear();
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
    if (!this.auto && this.status === 'cooldown' && Date.now() >= this.cooldownUntil) this._setStatus('idle', '');
    if (!this.busy && Date.now() >= this.nextAt) this._cycle();
    else this.onStatus?.();
  }

  async _cycle() {
    const { provider, apiKey } = this.getConfig();
    if (provider === 'off' || !AI_PROVIDERS[provider]) {
      this.nextAt = Date.now() + 5000;
      this._setStatus('off', 'AI insights are off (⚙ Settings).');
      return;
    }
    const asked = this.pending;
    const fresh = this.getMembers().filter((m) => m.consent === 'granted' && !m.left
      && m.reports.length && (this.auto ? m.reports.length !== this.seen.get(m.id) : asked.has(m.id)));
    this.pending = new Set();
    if (!fresh.length) {
      this.nextAt = this.auto ? Date.now() + BRIEF_INTERVAL_MS : Infinity;
      if (!this.auto) { this._setStatus('idle', ''); return; }
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

    const entries = fresh.map((m, i) => ({ ref: `P${i + 1}`, member: m, input: buildMemberInput(m) }));
    this.busy = true;
    this.inFlight = new Set(fresh.map((m) => m.id));
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
        const ref = new RegExp(`\\b${e.ref}\\b`, 'g');
        const named = (t) => String(t ?? '').replace(ref, e.member.name);
        const nb = {
          ...b, headline: named(b.headline), summary: named(b.summary),
          observations: (b.observations || []).map(named),
          engagement: { ...b.engagement, reasons: (b.engagement?.reasons || []).map(named) },
        };
        h.push({ ...nb, at: Date.now(), source: provider, simulated: e.input.simulated });
        if (h.length > MAX_HISTORY) h.shift();
        this.briefs.set(e.member.id, h);
        this.seen.set(e.member.id, e.member.reports.length);
        changed.push(e.member.id);
      }
      this.backoffMs = 0;
      this.nextAt = this.auto ? Date.now() + BRIEF_INTERVAL_MS : Infinity;
      this._setStatus('done', `Briefed ${changed.length} participant${changed.length === 1 ? '' : 's'}.`);
      this.onUpdate?.(changed);
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (e instanceof RateLimitError) {
        this.backoffMs = Math.min(10 * 60000, Math.max(60000, this.backoffMs * 2 || 60000, e.retryMs || 0));
        this.nextAt = Date.now() + this.backoffMs;
        this.cooldownUntil = this.nextAt;
        this._setStatus('cooldown', `Free-tier limit hit, cooling down ${Math.round(this.backoffMs / 1000)}s.`);
      } else if (e instanceof TransientError || e instanceof TypeError) {
        this.backoffMs = Math.min(5 * 60000, Math.max(20000, this.backoffMs * 2 || 20000));
        this.nextAt = Date.now() + this.backoffMs;
        this.cooldownUntil = this.nextAt;
        this._setStatus('cooldown', `${e instanceof TypeError ? 'Network error' : e.message.replace(/, retrying.*/, '')}, retrying in ${Math.round(this.backoffMs / 1000)}s.`);
      } else {
        this.nextAt = this.auto ? Date.now() + 2 * 60000 : Infinity;
        this._setStatus('error', e.message);
      }
      if (!this.auto && this.status === 'cooldown') this.nextAt = Infinity;
      this.log?.(`AI: ${e.message}`);
    } finally {
      this.busy = false;
      this.abort = null;
      this.inFlight = new Set();
      this.onStatus?.();
    }
  }
}
