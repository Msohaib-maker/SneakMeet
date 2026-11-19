// Bundles renderer.js -> dist/renderer.bundle.js.
// Keys from .env (gitignored) are injected as defaults; they can also be
// entered in the app's Settings instead. Never commit keys to source.
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';

const envFile = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const env = (name) => {
  if (process.env[name]) return process.env[name];
  const m = envFile.match(new RegExp(`^\s*${name}\s*=\s*"?([^"\r\n]*)"?`, 'm'));
  return m ? m[1].trim() : '';
};
// RELEASE=1 (used by `npm run dist`) builds WITHOUT keys so a shared installer
// can't leak them: users enter their own in Settings (or use simulated vitals).
const release = process.env.RELEASE === '1';
const apiKey = release && process.env.RELEASE_INCLUDE_SMARTSPECTRA_KEY !== '1' ? '' : env('SMARTSPECTRA_API_KEY');
const geminiKey = release ? '' : env('GEMINI_API_KEY');
// Default meeting server, e.g. MEET_SERVER_URL=wss://your-server.onrender.com
const serverUrl = env('MEET_SERVER_URL') || 'ws://localhost:8787';

await build({
  entryPoints: ['src/renderer.js'],
  bundle: true,
  outfile: 'dist/renderer.bundle.js',
  platform: 'browser',
  format: 'iife',
  logLevel: 'warning',
  define: {
    __DEFAULT_API_KEY__: JSON.stringify(apiKey),
    __DEFAULT_GEMINI_KEY__: JSON.stringify(geminiKey),
    __DEFAULT_SERVER_URL__: JSON.stringify(serverUrl),
  },
});

console.log(`[build] renderer bundled${release ? ' for RELEASE' : ''} (SmartSpectra key: ${apiKey ? 'included' : 'none'}, Gemini key: ${geminiKey ? 'included' : 'none'}, server: ${serverUrl})`);
