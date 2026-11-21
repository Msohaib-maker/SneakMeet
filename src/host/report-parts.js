const SVG = 'http://www.w3.org/2000/svg';
export const fmt = (n) => (n == null || !Number.isFinite(n) ? '—' : String(Math.round(n)));

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function sparkline(values, { color = 'var(--accent)', height = 56 } = {}) {
  const w = 300;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('spark');
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => Number.isFinite(v));
  if (pts.length < 2) {
    const t = document.createElementNS(SVG, 'text');
    t.setAttribute('x', '6'); t.setAttribute('y', String(height / 2 + 4));
    t.setAttribute('class', 'spark-empty');
    t.textContent = 'collecting…';
    svg.appendChild(t);
    return svg;
  }
  const ys = pts.map(([, v]) => v);
  let lo = Math.min(...ys); let hi = Math.max(...ys);
  if (hi - lo < 4) { lo -= 2; hi += 2; }
  const n = Math.max(values.length - 1, 1);
  const xy = pts.map(([i, v]) => [(i / n) * w, height - 6 - ((v - lo) / (hi - lo)) * (height - 12)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = document.createElementNS(SVG, 'path');
  area.setAttribute('d', `${d} L${xy[xy.length - 1][0]},${height} L${xy[0][0]},${height} Z`);
  area.setAttribute('fill', color);
  area.setAttribute('opacity', '0.12');
  const line = document.createElementNS(SVG, 'path');
  line.setAttribute('d', d);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '2');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  const dot = document.createElementNS(SVG, 'circle');
  const [lx, ly] = xy[xy.length - 1];
  dot.setAttribute('cx', String(lx)); dot.setAttribute('cy', String(ly)); dot.setAttribute('r', '3');
  dot.setAttribute('fill', color);
  svg.append(area, line, dot);
  return svg;
}
