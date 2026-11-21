const round = (n) => (Number.isFinite(n) ? Math.round(n) : null);
const avg = (xs) => {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function previewBrief(input) {
  const rs = input.reports.filter((r) => r.quality == null || r.quality >= 40);
  if (!rs.length) {
    return {
      headline: 'Waiting for clear readings',
      summary: 'Not enough good-quality data yet.',
      engagement: { level: 'unknown', score: null, reasons: [] },
      observations: [],
    };
  }
  const recent = rs.slice(-3);
  const facing = avg(recent.map((r) => r.facingScreenPct));
  const present = avg(recent.map((r) => r.facePresentPct));
  const talking = avg(recent.map((r) => r.talkingPct));
  const blinks = avg(recent.map((r) => r.blinksPerMin));
  const pulseNow = avg(recent.map((r) => r.pulse));
  const pulseStart = avg(rs.slice(0, 3).map((r) => r.pulse));
  const breathNow = avg(recent.map((r) => r.breathing));
  const ex = {};
  for (const r of recent) for (const [k, v] of Object.entries(r.expressions || {})) ex[k] = (ex[k] || 0) + v / recent.length;
  const topEx = Object.entries(ex).sort((a, b) => b[1] - a[1])[0];

  const reasons = [];
  let score = 50;
  if (facing != null) {
    score = facing * 0.7 + (present ?? facing) * 0.3;
    reasons.push(`Facing the screen ~${round(facing)}% of the time`);
  }
  if (talking != null && talking > 15) { score += 8; reasons.push(`Talking ~${round(talking)}% of the time`); }
  if (blinks != null && blinks > 30) { score -= 8; reasons.push(`Blinking often (~${round(blinks)}/min)`); }
  score = Math.max(0, Math.min(100, round(score)));
  const level = facing == null ? 'unknown' : score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

  const observations = [];
  if (pulseNow != null && pulseStart != null && Math.abs(pulseNow - pulseStart) >= 5) {
    observations.push(`Pulse ${pulseNow > pulseStart ? 'rose' : 'fell'} from ~${round(pulseStart)} to ~${round(pulseNow)} bpm.`);
  } else if (pulseNow != null) observations.push(`Pulse steady around ${round(pulseNow)} bpm.`);
  if (breathNow != null) observations.push(`Breathing around ${round(breathNow)}/min.`);
  if (topEx) observations.push(`Mostly ${topEx[0]} (${round(topEx[1])}%).`);

  return {
    headline: level === 'unknown' ? 'Engagement unclear' : `Engagement looks ${level}`,
    summary: observations.slice(0, 2).join(' ') || 'Vitals not available yet.',
    engagement: { level, score: level === 'unknown' ? null : score, reasons },
    observations,
  };
}
