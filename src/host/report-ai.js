import { AI_PROVIDERS, CAVEAT, buildMemberInput } from '../ai/insights.js';
import { el } from './report-parts.js';

export const aiPanelMethods = {
  _aiPanel(m) {
    const providerId = this.getProvider();
    const provider = AI_PROVIDERS[providerId] || AI_PROVIDERS.off;
    const briefer = this.getBriefer();
    const history = briefer ? briefer.history(m.id) : [];
    const r = history[history.length - 1];
    const ai = el('div', 'rsection ai');
    const head = el('div', 'row');
    head.appendChild(el('div', 'rsection-title', '🤖 AI brief'));
    head.appendChild(el('span', 'spacer'));
    head.appendChild(el('span', 'chip sim', provider.label));
    const working = !!briefer?.isWorkingOn(m.id);
    const btn = el('button', 'small', working ? 'Summarising…' : '✦ Summarise');
    btn.type = 'button';
    btn.disabled = !briefer || working || briefer.busy || providerId === 'off' || ['cooldown', 'capped'].includes(briefer.status);
    btn.addEventListener('click', () => { briefer.request(m.id); this.render(); });
    head.appendChild(btn);
    ai.appendChild(head);

    const body = el('div', 'ai-body');
    if (providerId === 'off') body.appendChild(el('div', 'muted', 'AI insights are off. Choose a provider in ⚙ Settings.'));
    else if (!r) body.appendChild(el('div', working ? 'ai-loading' : 'muted', working ? 'Summarising the latest readings…' : 'No AI summary yet. Press Summarise.'));
    if (briefer && ['error', 'cooldown', 'capped'].includes(briefer.status)) body.appendChild(el('div', 'warn', briefer.message));

    if (r) {
      const top = el('div', 'ai-top');
      const gauge = el('div', `gauge lvl-${r.engagement?.level || 'unknown'}`);
      gauge.style.setProperty('--p', String(r.engagement?.score ?? 0));
      gauge.appendChild(el('span', 'gauge-val', r.engagement?.score == null ? '?' : String(r.engagement.score)));
      top.appendChild(gauge);
      const txt = el('div', 'ai-text');
      txt.appendChild(el('div', 'label', `Engagement · ${r.engagement?.level || 'unknown'} · ${new Date(r.at).toLocaleTimeString()}`));
      txt.appendChild(el('div', 'ai-headline', r.headline));
      txt.appendChild(el('div', 'ai-summary', r.summary));
      top.appendChild(txt);
      body.appendChild(top);
      const list = el('ul', 'ai-list');
      for (const s of [...(r.engagement?.reasons || []), ...(r.observations || [])]) list.appendChild(el('li', '', s));
      if (list.childNodes.length) body.appendChild(list);
      if (history.length > 1) {
        const prev = el('div', 'ai-prev');
        prev.appendChild(el('div', 'label', 'Earlier briefs'));
        for (const h of history.slice(0, -1).reverse().slice(0, 5)) {
          prev.appendChild(el('div', 'ai-prev-row', `${new Date(h.at).toLocaleTimeString()} · ${h.headline} · ${h.engagement?.level}${h.engagement?.score != null ? ` ${h.engagement.score}` : ''}`));
        }
        body.appendChild(prev);
      }
      body.appendChild(el('div', 'muted', CAVEAT + (r.source === 'preview' ? ' (Rule-based preview, not AI.)' : '')));
    }
    ai.appendChild(body);

    const details = el('details', 'ai-data');
    details.open = !!this.detailsOpen;
    details.addEventListener('toggle', () => { this.detailsOpen = details.open; });
    details.appendChild(el('summary', '', `Data sent to ${provider.network ? provider.label : 'the analyzer'} (anonymised: no name, no video)`));
    details.appendChild(el('pre', '', JSON.stringify(buildMemberInput(m), null, 2)));
    ai.appendChild(details);
    return ai;
  },
};
