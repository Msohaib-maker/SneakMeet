'use strict';

const path = require('path');
const { app, BrowserWindow, session } = require('electron');

// Packaged builds load the native runtime from resources/smartspectra/
// (a DLL can't be loaded from inside app.asar). Must be set before requiring the SDK.
if (app.isPackaged && !process.env.SMARTSPECTRA_CAPI_PATH) {
  const LIB = { darwin: 'libsmartspectra_capi.dylib', win32: 'smartspectra_capi.dll', linux: 'libsmartspectra_capi.so' }[process.platform];
  if (LIB) process.env.SMARTSPECTRA_CAPI_PATH = path.join(process.resourcesPath, 'smartspectra', LIB);
}

// MEET_PROFILE=2 runs a second, independent instance on the same machine
// (separate storage) so you can test a meeting with yourself.
if (process.env.MEET_PROFILE) {
  app.setPath('userData', path.join(app.getPath('appData'), `presage-meet-profile-${process.env.MEET_PROFILE}`));
}

const { bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    backgroundColor: '#101218',
    webPreferences: {
      // The SDK ships its own preload bridge for the renderer-side SDK.
      preload: require.resolve('@smartspectra/node-sdk/preload'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  bindSmartSpectraIpc(win);

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Mirror renderer console output to the terminal for easier debugging.
  win.webContents.on('console-message', (e) => {
    if (e && e.message) console.log(`[renderer] ${e.message}`);
  });

  // Let the renderer stop + destroy the SDK before the window goes away;
  // otherwise native callbacks can fire into a destroyed webContents and abort.
  let shuttingDown = false;
  win.on('close', (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    shuttingDown = true;
    win.hide(); // feels instant to the user while the SDK winds down
    const timeout = new Promise((r) => setTimeout(() => r({ wasMeasuring: true, timedOut: true }), 5000));
    const shutdown = win.webContents
      .executeJavaScript('window.__shutdown ? window.__shutdown() : null')
      .catch((err) => { console.error('[main] renderer shutdown failed:', err); return { wasMeasuring: true }; });
    Promise.race([shutdown, timeout]).then(async (result) => {
      // The SDK runs in this process and finishes native teardown
      // asynchronously after stop(). Quitting before it completes aborts the
      // process (napi fatal error), so give it time when a session was live.
      if (result && result.wasMeasuring) await new Promise((r) => setTimeout(r, 3000));
      if (!win.isDestroyed()) win.destroy();
    });
  });

  const query = {};
  if (process.env.MEET_AUTOJOIN) query.autojoin = process.env.MEET_AUTOJOIN;
  // A second instance on the same laptop would create an audio feedback loop
  // (echo cancellation can't span two apps), so it joins with audio off.
  if (process.env.MEET_PROFILE) query.noaudio = '1';
  if (process.env.MEET_AUTOCONSENT === '1') query.autoconsent = '1';
  // Testing: MEET_SIMULATED=0 forces the real SDK (uses credits), =1 forces simulated.
  if (process.env.MEET_SIMULATED === '0' || process.env.MEET_SIMULATED === '1') query.simulated = process.env.MEET_SIMULATED;
  win.loadFile(path.join(__dirname, 'index.html'), { query });

  if (process.env.SMARTSPECTRA_DIAGNOSTICS === '1') win.webContents.openDevTools({ mode: 'detach' });

  // Testing: MEET_SHOTS=<dir> saves screenshots of the meeting and the settings dialog.
  if (process.env.MEET_SHOTS) {
    const fs = require('fs');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const shot = async (name) => fs.writeFileSync(path.join(process.env.MEET_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    const click = (sel) => win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(sel)})?.click()`);
    win.webContents.once('did-finish-load', async () => {
      await wait(9000); await shot('1-main');
      console.log('[shots] layout', await win.webContents.executeJavaScript(`JSON.stringify({
        grid: document.getElementById('grid').getBoundingClientRect(),
        tiles: [...document.querySelectorAll('.tile')].map((t) => [t.className, Math.round(t.getBoundingClientRect().top), Math.round(t.getBoundingClientRect().height), Math.round(t.getBoundingClientRect().width)]),
        win: [innerWidth, innerHeight] })`));
      await click('#btn-settings'); await wait(1500);
      console.log('[shots] settings hidden =', await win.webContents.executeJavaScript(`document.getElementById('settings').hidden + ' ' + getComputedStyle(document.getElementById('settings')).display`));
      await shot('2-settings-vitals');
      await click('.stab[data-tab="camera"]'); await wait(1500); await shot('3-settings-camera');
      await click('.stab[data-tab="ai"]'); await wait(1500); await shot('4-settings-ai');
      await click('#btn-close-settings'); await click('#btn-self-scan'); await wait(1500); await shot('5-scanner-off');
      await click('#btn-self-scan');
    });
  }
}

app.whenReady().then(() => {
  // Grant camera + microphone to our bundled local page only; deny everything else.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = (details && details.requestingUrl) || (wc && wc.getURL()) || '';
    const types = (details && details.mediaTypes) || [];
    const avOnly = types.length > 0 && types.every((t) => t === 'video' || t === 'audio');
    callback(permission === 'media' && avOnly && url.startsWith('file://'));
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
