import { $, METRIC_NAME, log } from './ui.js';
import { sdk, start, stop, summary } from './session.js';
import { SmartSpectraSDK } from '@smartspectra/node-sdk/renderer';

$('start').onclick = start;
$('stop').onclick = stop;
$('export').onclick = async () => {
  const text = summary();
  try { await navigator.clipboard.writeText(text); log('Report copied to clipboard.'); } catch { log(text); }
};
$('insight').onclick = async () => {
  if (!sdk) return;
  try { const id = await sdk.requestInsight($('insight-q').value); log(`insight #${id} requested`); } catch (e) { log(`insight failed: ${e.message}`); }
};

window.__shutdown = async () => {
  const wasMeasuring = !!sdk;
  await stop();
  return { wasMeasuring };
};

log(`Ready. SDK ${SmartSpectraSDK.version || ''}. Known metric types: ${Object.values(METRIC_NAME).length}. Tip: keep runs short; HRV needs ~60 s, EDA ~35 s.`);
