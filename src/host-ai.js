// Host panel header: a little AI bot that "eats" incoming readings and,
// every ~40 s, writes a brief for each participant. Plus Markdown downloads.
import { AI_PROVIDERS, CAVEAT } from './insights.js';
import { DAILY_CAP } from './ai-brief.js';
import { topExpression } from './host-dashboard.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const MOOD = { idle: 'idle', waiting: 'idle', thinking: 'thinking', done: 'happy', cooldown: 'sleep', capped: 'sleep', off: 'sleep', error: 'error' };

export class HostAIPanel {
  // briefer: AIBriefer; getProvider(): provider id; onBriefNow(); onDownloadAll()
  constructor(container, { briefer, getProvider, onDownloadAll }) {
    this.briefer = briefer;
    this.getProvider = getProvider;
    this.root = el('div', 'ai-panel');

    this.stage = el('div', 'bot-stage');
    this.bot = el('div', 'bot idle');
    const head = el('div', 'bot-head');
    const eyes = el('div', 'bot-eyes');
    eyes.append(el('i', 'eye'), el('i', 'eye'));
    head.append(el('i', 'bot-ear l'), el('i', 'bot-ear r'), eyes, el('i', 'bot-cheek l'), el('i', 'bot-cheek r'), el('div', 'bot-mouth'));
    this.bot.append(el('div', 'bot-antenna'), head, el('span', 'bot-zz', 'z'));
    this.stage.appendChild(this.bot);

    const info = el('div', 'ai-info');
    this.title = el('div', 'ai-name', 'Pixel · AI analyst');
    this.statusEl = el('div', 'ai-status', 'Starting…');
    this.meta = el('div', 'ai-meta');
    const actions = el('div', 'row');
    this.btnNow = el('button', 'secondary small', '✦ Brief now');
    this.btnNow.type = 'button';
    this.btnNow.addEventListener('click', () => { briefer.runNow(); this.render(); });
    const dl = el('button', 'secondary small', '⬇ All reports');
    dl.type = 'button';
    dl.title = 'Download every participant\'s report card (Markdown)';
    dl.addEventListener('click', () => onDownloadAll());
    actions.append(this.btnNow, dl);
    info.append(this.title, this.statusEl, this.meta, actions);

    this.root.append(this.stage, info);
    container.prepend(this.root);
    this.moodTimer = null;
    this.render();
  }

  // Animate a reading chip flying into the bot's mouth.
  feed(report) {
    const bits = [];
    if (report.pulse?.avg != null) bits.push(`❤ ${Math.round(report.pulse.avg)}`);
    if (report.breathing?.avg != null) bits.push(`🫁 ${Math.round(report.breathing.avg)}`);
    const ex = topExpression(report.face);
    if (ex) bits.push({ happy: '😊', neutral: '😐', surprise: '😮', sad: '😔', angry: '😠', fear: '😨', disgust: '😖', contempt: '😏' }[ex] || '🙂');
    if (report.face?.facingPct != null) bits.push(`👀 ${Math.round(report.face.facingPct)}%`);
    bits.forEach((text, i) => {
      const chip = el('span', 'bite', text);
      chip.style.setProperty('--y', `${10 + Math.random() * 60}%`);
      chip.style.animationDelay = `${i * 0.25}s`;
      chip.addEventListener('animationend', () => chip.remove());
      this.stage.appendChild(chip);
    });
    this.bot.classList.add('eating');
    clearTimeout(this.eatTimer);
    this.eatTimer = setTimeout(() => this.bot.classList.remove('eating'), 1200 + bits.length * 250);
  }

  render() {
    const b = this.briefer;
    const provider = this.getProvider();
    const mood = MOOD[b.status] || 'idle';
    for (const m of ['idle', 'thinking', 'happy', 'sleep', 'error']) this.bot.classList.toggle(m, m === mood);

    const secs = Math.max(0, Math.ceil((b.nextAt - Date.now()) / 1000));
    let text = b.message || 'Listening…';
    if (b.status === 'waiting' || b.status === 'done' || b.status === 'idle') text = `${b.status === 'done' ? b.message + ' ' : ''}Next brief in ${secs}s`;
    if (b.status === 'cooldown') text = `${b.message.replace(/\d+s\.$/, '')}${secs}s`;
    this.statusEl.textContent = text;
    this.statusEl.className = `ai-status ${b.status}`;

    const p = AI_PROVIDERS[provider] || AI_PROVIDERS.off;
    this.meta.textContent = p.network
      ? `${p.label} · ${b.callsToday}/${DAILY_CAP} calls today · one call covers everyone`
      : `${p.label}${provider === 'preview' ? ' · no network' : ''}`;
    this.btnNow.disabled = b.busy || b.status === 'cooldown' || b.status === 'capped' || provider === 'off';
  }

  destroy() {
    clearTimeout(this.eatTimer);
    this.root.remove();
  }
}

// --- Downloads -----------------------------------------------------------------

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
