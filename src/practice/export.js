import { STATE_LABEL, fmtTime, r0 } from './helpers.js';
import { downloadText } from '../host/host-ai.js';

export const exportMethods = {
  markdown() {
    const s = this.session, sum = this.summary;
    const mins = Math.round((Date.now() - s.startedAt) / 6000) / 10;
    const lines = [
      `# Practice debrief: ${this.scenarioLabel}`, '',
      `${new Date(s.startedAt).toLocaleString()} · ${mins} min${s.windows.some((w) => w.simulated) ? ' · SIMULATED readings' : ''}`, '',
    ];
    if (sum) {
      lines.push(`## ${sum.headline || STATE_LABEL[sum.state]}`, '', sum.summary || '', '');
      if (sum.strengths.length) lines.push('**Strengths**', ...sum.strengths.map((x) => `- ${x}`), '');
      if (sum.improvements.length) lines.push('**To work on**', ...sum.improvements.map((x) => `- ${x}`), '');
    }
    if (s.baseline) lines.push(`Baseline: pulse ${r0(s.baseline.pulse)} bpm, breathing ${r0(s.baseline.breathing)}/min`, '');
    lines.push('| Time | State | Score | Pulse | Breathing | HRV | Facing % | Talking % | Top expression |', '|---|---|---|---|---|---|---|---|---|');
    for (const w of s.windows) {
      const top = w.face?.expressions ? Object.entries(w.face.expressions).sort((a, b) => b[1] - a[1])[0] : null;
      lines.push(`| ${fmtTime((w.at - s.startedAt) / 1000)} | ${w.calm?.label || '—'} | ${w.calm?.score ?? '—'} | ${r0(w.pulse?.avg)} | ${r0(w.breathing?.avg)} | ${r0(w.hrv)} | ${r0(w.face?.facingPct)} | ${r0(w.face?.talkingPct)} | ${top ? `${top[0]} ${r0(top[1])}%` : '—'} |`);
    }
    lines.push('', '## Coach notes', '');
    for (const m of this.messages.filter((x) => x.source !== 'host')) lines.push(`- **${fmtTime((m.at - s.startedAt) / 1000)} ${m.headline}**: ${m.feedback} _Tip: ${m.tip}_`);
    lines.push('', '_Camera-based wellness estimates (Presage SmartSpectra). Not a medical or psychological assessment._');
    return lines.join('\n');
  },

  download() {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    downloadText(`practice-${this.session.scenario}-${stamp}.md`, this.markdown());
  },
};
