export function drawWave(canvas, series, { ok = true, span = 180 } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = ok ? 1 : 0.35;
  for (const { data, color, width = 2 } of series) {
    const d = data.slice(-span);
    if (d.length < 2) continue;
    let lo = Math.min(...d);
    let hi = Math.max(...d);
    if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    d.forEach((v, i) => {
      const x = (i / (d.length - 1)) * w;
      const y = h - 4 - ((v - lo) / (hi - lo)) * (h - 8);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
