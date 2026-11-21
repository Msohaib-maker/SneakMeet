import { AI_PROVIDERS, CAVEAT } from '../ai/insights.js';
import { DAILY_CAP } from '../ai/ai-brief.js';
import { topExpression } from './dashboard-data.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const MOOD = { idle: 'idle', waiting: 'idle', thinking: 'thinking', done: 'happy', cooldown: 'sleep', capped: 'sleep', off: 'sleep', error: 'error' };

export function makeBot(mood = 'idle') {
  const wrap = el('span', 'minibot');
  const bot = el('span', `bot ${mood}`);
  const head = el('span', 'bot-head');
  const eyes = el('span', 'bot-eyes');
  eyes.append(el('i', 'eye'), el('i', 'eye'));
  const cigar = el('i', 'bot-cigar');
  const smoke = el('span', 'bot-smoke');
  smoke.append(el('i'), el('i'), el('i'));
  cigar.append(el('i', 'bot-ember'), smoke);
  const hat = el('i', 'bot-hat');
  hat.appendChild(el('i', 'bot-hat-band'));
  head.append(hat, el('i', 'bot-ear l'), el('i', 'bot-ear r'), eyes, el('i', 'bot-shades'), el('i', 'bot-brow'),
    el('i', 'bot-cheek l'), el('i', 'bot-cheek r'), el('span', 'bot-mouth'), cigar);
  bot.append(el('span', 'bot-antenna'), head, el('span', 'bot-zz', 'z'));
  wrap.appendChild(bot);
  return wrap;
}

export function setBotMood(wrap, mood) {
  const bot = wrap.firstChild;
  for (const m of ['idle', 'thinking', 'happy', 'sleep', 'error']) bot.classList.toggle(m, m === mood);
}

export class HostAIPanel {
  constructor(container, { briefer, getProvider, onDownloadAll, onBot }) {
    this.briefer = briefer;
    this.getProvider = getProvider;
    this.root = el('div', 'ai-line');
    this.bot = makeBot();
    this.bot.title = 'Show the floating bot';
    this.bot.addEventListener('click', () => onBot?.());
    this.statusEl = el('span', 'ai-status');
    const dl = el('button', 'secondary small', '⬇ All');
    dl.type = 'button';
    dl.title = 'Download every participant\'s report card (Markdown)';
    dl.addEventListener('click', () => onDownloadAll());
    this.root.append(this.bot, this.statusEl, el('span', 'spacer'), dl);
    container.prepend(this.root);
    this.render();
  }

  render() {
    const b = this.briefer;
    const provider = this.getProvider();
    setBotMood(this.bot, b.busy ? 'thinking' : MOOD[b.status] || 'idle');
    const p = AI_PROVIDERS[provider] || AI_PROVIDERS.off;
    let text;
    if (provider === 'off') text = 'AI summaries off (⚙ AI briefs)';
    else if (b.busy) text = 'Summarising…';
    else if (b.status === 'cooldown') text = `Free-tier pause, try again in ${Math.max(0, Math.ceil((b.cooldownUntil - Date.now()) / 1000))}s`;
    else if (b.status === 'capped' || b.status === 'error') text = b.message;
    else text = `Tap a bot for a ${provider === 'gemini' ? 'Gemini' : 'quick'} summary`;
    this.statusEl.textContent = text;
    this.statusEl.className = `ai-status ${b.status}`;
    this.statusEl.title = p.network ? `${p.label} · ${b.callsToday}/${DAILY_CAP} calls today` : p.label;
  }

  destroy() { this.root.remove(); }
}

const fmt = (n) => (n == null || !Number.isFinite(n) ? '—' : String(Math.round(n)));

export function reportCardMarkdown(member, briefs) {
  const r = member.reports[member.reports.length - 1];
  const lines = [`## ${member.name}`, ''];
  if (r) {
    lines.push(`- Latest vitals (${new Date(r.at).toLocaleTimeString()}): pulse ${fmt(r.pulse?.avg)} bpm, breathing ${fmt(r.breathing?.avg)}/min, HRV ${fmt(r.hrv)} ms, signal quality ${fmt(r.quality)}%${r.simulated ? ' — SIMULATED' : ''}`);
    if (r.face) lines.push(`- Face signals: in frame ${fmt(r.face.presentPct)}%, facing screen ${fmt(r.face.facingPct)}%, talking ${fmt(r.face.talkingPct)}%, blinks ${fmt(r.face.blinksPerMin)}/min, mostly ${topExpression(r.face) || '—'}`);
    lines.push(`- Reports received: ${member.reports.length}`);
  } else lines.push('- No reports received.');
  lines.push('');
  if (!briefs.length) lines.push('_No AI briefs yet._');
  for (const b of [...briefs].reverse()) {
    const eng = b.engagement?.level === 'unknown' ? 'unknown' : `${b.engagement?.level} (${b.engagement?.score})`;
    lines.push(`### ${new Date(b.at).toLocaleTimeString()} — ${b.headline}`, '', b.summary, '', `Engagement: ${eng}`);
    for (const s of [...(b.engagement?.reasons || []), ...(b.observations || [])]) lines.push(`- ${s}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function allReportsMarkdown(members, briefer, room) {
  const head = [
    `# Wellness report cards — room "${room}"`, '',
    `Generated ${new Date().toLocaleString()}. Participants who consented to share wellness reports with the host.`,
    `AI: ${briefer ? 'briefs as generated during the meeting' : 'n/a'}. ${CAVEAT}`, '',
  ];
  const cards = members.filter((m) => m.reports.length || briefer?.history(m.id).length)
    .map((m) => reportCardMarkdown(m, briefer?.history(m.id) || []));
  return [...head, ...(cards.length ? cards : ['_No reports yet._'])].join('\n');
}

export function downloadText(filename, text, type = 'text/markdown') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
