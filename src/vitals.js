// Thin wrapper around the SmartSpectra renderer SDK. Measures ONE person
// (the local user) from the local camera stream. Everything is computed
// on this device; only SDK auth/telemetry talks to Presage.

import {
  SmartSpectraSDK,
  ProcessingStatus,
  ValidationCode,
  breathingMetrics,
  cardioMetrics,
  MetricType,
} from '@smartspectra/node-sdk/renderer';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';

const nameMap = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k.replace(/^k/, '')]));
const STATUS_NAMES = nameMap(ProcessingStatus);
const VALIDATION_NAMES = nameMap(ValidationCode);
const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);

// Seconds of data each metric needs before it is meaningful (SDK docs).
export const WARMUP = { pulse: 12, breathing: 30, hrv: 60 };

// Face signals (no landmarks: we only need blink/talk/expression events).
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
    this.latest = {
      elapsed: 0,
      pulse: null, pulseStable: false,
      breathing: null, breathingStable: false,
      hrv: null, hrvStable: false,
      face: emptyFace(),
    };

    try {
      await this._startSdk(stream, true);
    } catch (err) {
      // If face metrics aren't available on this key, fall back to vitals only.
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
      // A terminal error drops every later frame; tear the session down.
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

    // Give the SDK a video-only view of the shared camera stream. The SDK
    // never stops host-supplied tracks, so the call keeps its video.
    sdk.useMediaStream(new MediaStream(stream.getVideoTracks()));
    try {
      await sdk.start();
    } catch (err) {
      this.sdk = null;
      try { sdk.destroy(); } catch { /* ignore */ }
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
    if (br) { v.breathing = Number(br.value); v.breathingStable = !!br.stable; }
    const pr = last(m.cardio?.pulseRate);
    if (pr) { v.pulse = Number(pr.value); v.pulseStable = !!pr.stable; }
    // HRV confidence is 0 until its 60 s window has filled.
    const hrv = last(m.cardio?.hrv);
    if (hrv && hrv.confidence > 0) { v.hrv = Number(hrv.rmssd); v.hrvStable = !!hrv.stable; }

    const face = m.face;
    if (face && !this.faceLogged && (face.blinking?.length || face.talking?.length || face.expression?.length)) {
      this.faceLogged = true;
      this.log?.(`Face signals arriving from the SDK (blink ${face.blinking?.length || 0}, talk ${face.talking?.length || 0}, expression ${face.expression?.length || 0}).`);
    }
    if (face) {
      const f = v.face;
      for (const b of face.blinking || []) {
        if (b.detected && !f.blinking) f.blinks += 1; // count rising edges
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
      }
    }

    this.onUpdate?.({ ...v, face: { ...v.face } });
  }

  async stop() {
    const sdk = this.sdk;
    if (!sdk) return;
    this.sdk = null;
    try { await sdk.stop(); } catch (e) { this.log?.(`Vitals stop failed: ${e.message}`); }
    try { sdk.destroy(); } catch { /* already destroyed */ }
    this.onStopped?.();
  }
}
