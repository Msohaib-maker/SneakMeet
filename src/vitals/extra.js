const KEEP = 600;
const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);

export function createExtra() {
  return { chest: [], belly: [], pressure: [], breathOk: false, pulseOk: false, meanNn: null, sdnn: null, baevsky: null, hrvOk: false };
}

function push(arr, items) {
  for (const it of items || []) {
    const v = Number(it.value);
    if (Number.isFinite(v)) arr.push(v);
  }
  if (arr.length > KEEP) arr.splice(0, arr.length - KEEP);
}

export function readExtra(x, m) {
  const b = m.breathing;
  if (b) {
    push(x.chest, b.upperTrace);
    push(x.belly, b.lowerTrace);
    const t = last(b.upperTrace);
    if (t) x.breathOk = !!t.stable;
  }
  const c = m.cardio;
  if (c) {
    push(x.pressure, c.arterialPressureTrace);
    const p = last(c.arterialPressureTrace);
    if (p) x.pulseOk = !!p.stable;
    const h = last(c.hrv);
    if (h && h.confidence > 0) {
      x.meanNn = Number(h.meanNn) || null;
      x.sdnn = Number(h.sdnn) || null;
      x.baevsky = Number(h.baevsky) || null;
      x.hrvOk = !!h.stable;
    }
  }
}

export function simulateExtra(x, t, pulse, breathing, hrv) {
  const fps = 30;
  for (let i = 0; i < fps; i++) {
    const s = t + i / fps;
    const br = Math.sin((2 * Math.PI * breathing * s) / 60);
    x.chest.push(br + (Math.random() - 0.5) * 0.08);
    x.belly.push(0.7 * Math.sin((2 * Math.PI * breathing * s) / 60 - 0.4) + (Math.random() - 0.5) * 0.08);
    const ph = ((pulse * s) / 60) % 1;
    x.pressure.push(Math.exp(-((ph - 0.15) ** 2) / 0.004) + 0.45 * Math.exp(-((ph - 0.42) ** 2) / 0.01));
  }
  for (const a of [x.chest, x.belly, x.pressure]) if (a.length > KEEP) a.splice(0, a.length - KEEP);
  x.breathOk = t > 8;
  x.pulseOk = t > 4;
  if (hrv != null) {
    x.meanNn = 60000 / pulse;
    x.sdnn = hrv * 1.2;
    x.baevsky = Math.round(9000 / (hrv * hrv) * 10) / 10 + 40;
    x.hrvOk = true;
  }
}

export function movementShare(x, n = 150) {
  const spread = (a) => {
    const s = a.slice(-n);
    if (s.length < 30) return null;
    return Math.max(...s) - Math.min(...s);
  };
  const c = spread(x.chest);
  const b = spread(x.belly);
  if (!c || !b) return null;
  return b / (c + b);
}
