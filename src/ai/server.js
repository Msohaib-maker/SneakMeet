let base = '';

export function setServerUrl(url) {
  base = String(url || '').trim().replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/+$/, '');
}

export const serverBase = () => base;

export async function fetchSdkKey() {
  if (!base) throw new Error('no meeting server set');
  const res = await fetch(`${base}/api/sdk-key`);
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok || !body?.apiKey) throw new Error(body?.error?.message || `server error ${res.status}`);
  return body.apiKey;
}
