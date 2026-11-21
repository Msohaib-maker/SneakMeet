import { WARMUP, emptyFace } from './vitals.js';
import { createExtra, simulateExtra } from './extra.js';

export class SimulatedVitals {
  constructor({ onStatus, onUpdate, onStopped }) {
    Object.assign(this, { onStatus, onUpdate, onStopped });
    this.timer = null;
  }

  get running() { return !!this.timer; }

  async start() {
    if (this.timer) return;
    const r = Math.random;
    this.base = { pulse: 64 + r() * 16, breathing: 12 + r() * 5, hrv: 35 + r() * 25 };
    this.cur = { ...this.base };
    this.event = null;
    this.face = emptyFace();
    this.extra = createExtra();
    this.away = 0;
    this.talk = 0;
    this.mood = { neutral: 70, happy: 15, surprise: 5, sad: 4, angry: 2, fear: 2, disgust: 1, contempt: 1 };
    this.firstAt = Date.now();
    this.onStatus?.('Running (simulated)');
    this.timer = setInterval(() => this._tick(), 1000);
    this._tick();
  }

  _tick() {
    const elapsed = (Date.now() - this.firstAt) / 1000;
    if (!this.event && Math.random() < 0.015) this.event = { until: elapsed + 20, add: 8 + Math.random() * 10 };
    if (this.event && elapsed > this.event.until) this.event = null;
    const e = this.event;
    const walk = (v, target, step, pull) => v + (Math.random() - 0.5) * step + (target - v) * pull;
    this.cur.pulse = walk(this.cur.pulse, this.base.pulse + (e ? e.add : 0), 2, 0.12);
    this.cur.breathing = walk(this.cur.breathing, this.base.breathing + (e ? 3 : 0), 0.6, 0.12);
    this.cur.hrv = walk(this.cur.hrv, this.base.hrv - (e ? 12 : 0), 2, 0.06);

    this._tickFace(e);
    simulateExtra(this.extra, elapsed, this.cur.pulse, this.cur.breathing, elapsed >= WARMUP.hrv ? this.cur.hrv : null);

    this.onUpdate?.({
      elapsed,
      face: { ...this.face, expressions: { ...this.face.expressions } },
      simulated: true,
      extra: this.extra,
      pulse: elapsed >= 3 ? this.cur.pulse : null,
      pulseStable: elapsed >= WARMUP.pulse,
      breathing: elapsed >= 5 ? this.cur.breathing : null,
      breathingStable: elapsed >= WARMUP.breathing,
      hrv: elapsed >= WARMUP.hrv ? this.cur.hrv : null,
      hrvStable: elapsed >= WARMUP.hrv,
    });
  }

  _tickFace(event) {
    const f = this.face;
    const r = Math.random;
    if (this.away > 0) this.away -= 1; else if (r() < 0.04) this.away = 3 + Math.floor(r() * 10);
    if (this.talk > 0) this.talk -= 1; else if (r() < 0.05) this.talk = 4 + Math.floor(r() * 12);
    f.present = this.away === 0 || r() < 0.5;
    f.forward = f.present && this.away === 0;
    f.talking = f.present && this.talk > 0;
    f.blinking = f.present && r() < (f.forward ? 0.22 : 0.32);
    if (f.blinking) f.blinks += 1;
    const target = { ...this.mood };
    if (f.talking) { target.happy += 20; target.surprise += 5; target.neutral -= 25; }
    if (event) { target.neutral -= 10; target.surprise += 5; target.fear += 5; }
    const ex = f.expressions || { ...this.mood };
    let total = 0;
    for (const k of Object.keys(target)) {
      ex[k] = Math.max(0, ex[k] + (target[k] - ex[k]) * 0.25 + (r() - 0.5) * 4);
      total += ex[k];
    }
    for (const k of Object.keys(ex)) ex[k] = (100 * ex[k]) / (total || 1);
    f.expressions = ex;
  }

  async stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.onStopped?.();
  }
}
