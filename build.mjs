import { build } from 'esbuild';
import { existsSync, readFileSync, rmSync } from 'node:fs';

const envFile = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const env = (name) => {
  if (process.env[name]) return process.env[name];
  const m = envFile.match(new RegExp(`^\s*${name}\s*=\s*"?([^"\r\n]*)"?`, 'm'));
  return m ? m[1].trim() : '';
};
const release = process.env.RELEASE === '1';
const apiKey = release && process.env.RELEASE_INCLUDE_SMARTSPECTRA_KEY !== '1' ? '' : env('SMARTSPECTRA_API_KEY');
const geminiKey = release ? '' : env('GEMINI_API_KEY');
const serverUrl = env('MEET_SERVER_URL') || 'ws://localhost:8787';

await build({
  entryPoints: ['src/app/index.js'],
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

if (!release) {
  await build({
    entryPoints: ['sdk-test/test-renderer.js'],
    bundle: true,
    outfile: 'dist/sdk-test.bundle.js',
    platform: 'browser',
    format: 'iife',
    logLevel: 'warning',
    define: { __DEFAULT_API_KEY__: JSON.stringify(apiKey) },
  });
} else {
  rmSync('dist/sdk-test.bundle.js', { force: true });
}

console.log(`[build] renderer bundled${release ? ' for RELEASE' : ''} (SmartSpectra key: ${apiKey ? 'included' : 'none'}, Gemini key: ${geminiKey ? 'included' : 'none'}, server: ${serverUrl})`);
