const TICK_MS = 30;
const REMOTE_ACTIVE = 0.012;
const DUCK_GAIN = 0.08;
const HOLD_MS = 350;
const BARGE_IN = 2.2;
const BARGE_MIN = 0.03;

function rms(analyser, buf) {
  analyser.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export class EchoGate {
  constructor(micTrack) {
    this.ctx = new AudioContext();
    this.input = micTrack;
    const src = this.ctx.createMediaStreamSource(new MediaStream([micTrack]));
    this.micAnalyser = this.ctx.createAnalyser();
    this.micAnalyser.fftSize = 512;
    this.gain = this.ctx.createGain();
    const dest = this.ctx.createMediaStreamDestination();
    src.connect(this.micAnalyser);
    src.connect(this.gain).connect(dest);
    this.track = dest.stream.getAudioTracks()[0];
    this.remotes = new Map();
    this.buf = new Float32Array(512);
    this.enabled = true;
    this.lastRemote = 0;
    this.ducked = false;
    this.timer = setInterval(() => this._tick(), TICK_MS);
    this.ctx.resume().catch(() => {});
  }

  addRemote(stream) {
    if (this.remotes.has(stream.id) || !stream.getAudioTracks().length) return;
    const src = this.ctx.createMediaStreamSource(stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    this.remotes.set(stream.id, { src, analyser });
  }

  removeRemote(stream) {
    const r = stream && this.remotes.get(stream.id);
    if (!r) return;
    r.src.disconnect();
    this.remotes.delete(stream.id);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this._setGain(1);
  }

  _setGain(g) {
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(g, t, g < 1 ? 0.015 : 0.06);
  }

  _tick() {
    if (!this.enabled || !this.remotes.size) {
      if (this.ducked) { this.ducked = false; this._setGain(1); }
      return;
    }
    let remote = 0;
    for (const r of this.remotes.values()) remote = Math.max(remote, rms(r.analyser, this.buf));
    const mic = rms(this.micAnalyser, this.buf);
    const now = performance.now();
    if (remote > REMOTE_ACTIVE) this.lastRemote = now;
    const remoteTalking = now - this.lastRemote < HOLD_MS;
    const bargeIn = mic > BARGE_MIN && mic > remote * BARGE_IN;
    const duck = remoteTalking && !bargeIn;
    if (duck !== this.ducked) {
      this.ducked = duck;
      this._setGain(duck ? DUCK_GAIN : 1);
    }
  }

  stop() {
    clearInterval(this.timer);
    for (const r of this.remotes.values()) r.src.disconnect();
    this.remotes.clear();
    this.track.stop();
    this.input.stop();
    this.ctx.close().catch(() => {});
  }
}
