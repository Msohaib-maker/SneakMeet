import {
  SmartSpectraSDK,
  ProcessingStatus,
  ValidationCode,
  breathingMetrics,
  cardioMetrics,
  MetricType,
} from '@smartspectra/node-sdk/renderer';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';
import { createExtra, readExtra } from './extra.js';

const nameMap = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k.replace(/^k/, '')]));
const STATUS_NAMES = nameMap(ProcessingStatus);
const VALIDATION_NAMES = nameMap(ValidationCode);
const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);

export const WARMUP = { pulse: 12, breathing: 30, hrv: 60 };

const FACE_METRICS = [MetricType.BLINKING, MetricType.TALKING, MetricType.EXPRESSIONS];
export const EXPRESSIONS = ['neutral', 'happy', 'surprise', 'sad', 'angry', 'fear', 'disgust', 'contempt'];
const EXPRESSION_BY_ID = { 1: 'angry', 2: 'contempt', 3: 'disgust', 4: 'fear', 5: 'happy', 6: 'neutral', 7: 'sad', 8: 'surprise' };

export function emptyFace() {
  return { present: false, forward: false, blinking: false, talking: false, blinks: 0, expressions: null };
}

export class VitalsMonitor {
  constructor({ apiKey, log, onStatus, onHint, onUpdate, onError, onStopped }) {
    Object.assign(this, { apiKey, log, onStatus, onHint, onUpdate, onError, onStopped });
    this.sdk = null;
    this.latest = null;
    this.firstAt = null;
  }

  get running() { return !!this.sdk; }

  async start(stream) {
    if (this.sdk) return;
    this.firstAt = null;
    this.seen = new Set();
    this.diagAt = 0;
    this.diag = {};
    this.latest = {
      elapsed: 0,
      pulse: null, pulseStable: false, pulseConf: null,
      breathing: null, breathingStable: false, breathingConf: null,
      hrv: null, hrvStable: false,
      face: emptyFace(),
      extra: createExtra(),
    };

    try {
      await this._startSdk(stream, true);
    } catch (err) {
      this.log?.(`Face signals unavailable (${err.message}); measuring vitals only.`);
      await this._startSdk(stream, false);
    }
  }

  async _startSdk(stream, withFace) {
    const sdk = new SmartSpectraSDK({
      apiKey: this.apiKey,
      requestedMetrics: [...breathingMetrics, ...cardioMetrics, ...(withFace ? FACE_METRICS : [])],
      enableAccumulatedOutput: false,
    });
    this.sdk = sdk;

    sdk.on('processingStatus', (status) => {
      this.onStatus?.(STATUS_NAMES[status] || `Status(${status})`, status);
      if (status === ProcessingStatus.kError) setTimeout(() => this.stop(), 0);
    });
    sdk.on('validationStatus', (code, _ts, hint) => {
      const f = this.latest.face;
      f.present = code !== ValidationCode.kNoFaceFound;
      f.forward = f.present && code !== ValidationCode.kFaceNotForward;
      this.onHint?.(VALIDATION_NAMES[code] || `Code(${code})`, hint, code === ValidationCode.kOk);
    });
    sdk.on('metrics', (buf) => this._onMetrics(buf));
    sdk.on('error', (code, message, retryable) => this.onError?.(code, message, retryable));

    sdk.useMediaStream(new MediaStream(stream.getVideoTracks()));
    try {
      await sdk.start();
    } catch (err) {
      this.sdk = null;
      try { sdk.destroy(); } catch {}
      if (!withFace) this.onStopped?.();
      throw err;
    }
  }

  _onMetrics(buf) {
    let m;
    try { m = decodeMetrics(buf); } catch (e) { this.log?.(`Metrics decode error: ${e.message}`); return; }
    if (!this.firstAt) this.firstAt = Date.now();
    const v = this.latest;
    v.elapsed = (Date.now() - this.firstAt) / 1000;

    const br = last(m.breathing?.rate);
    if (br) { v.breathing = Number(br.value); v.breathingStable = !!br.stable; v.breathingConf = Number(br.confidence); this.diag.br = br.confidence; this._first('breathing', br); }
    const pr = last(m.cardio?.pulseRate);
    if (pr) { v.pulse = Number(pr.value); v.pulseStable = !!pr.stable; v.pulseConf = Number(pr.confidence); this.diag.pr = pr.confidence; this._first('pulse', pr); }
    const hrv = last(m.cardio?.hrv);
    if (hrv) { this.diag.hrv = hrv.confidence; this._first('hrv (any)', { value: hrv.rmssd, confidence: hrv.confidence, stable: hrv.stable }); }
    if (hrv && hrv.confidence > 0) { v.hrv = Number(hrv.rmssd); v.hrvStable = !!hrv.stable; v.hrvConf = Number(hrv.confidence); this._first('hrv (confident)', { value: hrv.rmssd, confidence: hrv.confidence, stable: hrv.stable }); }

    readExtra(v.extra, m);

    const face = m.face;
    if (face && !this.faceLogged && (face.blinking?.length || face.talking?.length || face.expression?.length)) {
      this.faceLogged = true;
      this.log?.(`Face signals arriving from the SDK (blink ${face.blinking?.length || 0}, talk ${face.talking?.length || 0}, expression ${face.expression?.length || 0}).`);
    }
    if (face) {
      const f = v.face;
      for (const b of face.blinking || []) {
        if (b.detected && !f.blinking) f.blinks += 1;
        f.blinking = !!b.detected;
      }
      const t = last(face.talking);
      if (t) f.talking = !!t.detected;
      const ex = last(face.expression);
      if (ex && ex.scores?.length) {
        const scores = {};
        for (const sc of ex.scores) {
          const name = EXPRESSION_BY_ID[sc.type];
          if (name) scores[name] = Number(sc.confidence) || 0;
        }
        f.expressions = scores;
        this._first('expressions', { value: Object.keys(scores).length, stable: ex.stable });
      }
    }

    if (Date.now() - this.diagAt > 15000) {
      this.diagAt = Date.now();
      const r = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : '-');
      const topEx = v.face.expressions ? Object.entries(v.face.expressions).sort((a, b) => b[1] - a[1])[0] : null;
      this.log?.(`[diag ${Math.round(v.elapsed)}s] pulse ${r(v.pulse)}${v.pulseStable ? ' stable' : ''} conf ${r(this.diag.pr)} · breathing ${r(v.breathing)}${v.breathingStable ? ' stable' : ''} conf ${r(this.diag.br)} · HRV ${r(v.hrv)} conf ${r(this.diag.hrv)} · face ${v.face.present ? 'yes' : 'no'}${v.face.forward ? '/forward' : ''} · expr ${topEx ? `${topEx[0]} ${r(topEx[1])}` : 'none'}`);
    }
    this.onUpdate?.({ ...v, face: { ...v.face } });
  }

  _first(name, x) {
    if (this.seen.has(name)) return;
    this.seen.add(name);
    const t = this.firstAt ? Math.round((Date.now() - this.firstAt) / 100) / 10 : 0;
    this.log?.(`[diag] first ${name} at ${t}s: value ${Number(x.value).toFixed?.(1) ?? x.value}${x.confidence != null ? `, conf ${Number(x.confidence).toFixed(2)}` : ''}, ${x.stable ? 'stable' : 'not stable'}`);
  }

  async stop() {
    const sdk = this.sdk;
    if (!sdk) return;
    this.sdk = null;
    try { await sdk.stop(); } catch (e) { this.log?.(`Vitals stop failed: ${e.message}`); }
    try { sdk.destroy(); } catch {}
    this.onStopped?.();
  }
}
