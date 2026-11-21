'use strict';

const path = require('path');
const { app, BrowserWindow, session } = require('electron');

if (app.isPackaged && !process.env.SMARTSPECTRA_CAPI_PATH) {
  const LIB = { darwin: 'libsmartspectra_capi.dylib', win32: 'smartspectra_capi.dll', linux: 'libsmartspectra_capi.so' }[process.platform];
  if (LIB) process.env.SMARTSPECTRA_CAPI_PATH = path.join(process.resourcesPath, 'smartspectra', LIB);
}

if (process.env.MEET_PROFILE) {
  app.setPath('userData', path.join(app.getPath('appData'), `presage-meet-profile-${process.env.MEET_PROFILE}`));
} else {
  const fs = require('fs');
  const current = app.getPath('userData');
  const legacy = path.join(app.getPath('appData'), 'Presage Meet');
  const marker = path.join(current, '.migrated-from-presage-meet');
  if (fs.existsSync(legacy) && !fs.existsSync(marker)) {
    try {
      fs.mkdirSync(current, { recursive: true });
      for (const sub of ['Local Storage', 'SmartSpectraSDK']) {
        const from = path.join(legacy, sub);
        if (!fs.existsSync(from)) continue;
        const to = path.join(current, sub);
        fs.rmSync(to, { recursive: true, force: true });
        fs.cpSync(from, to, { recursive: true });
      }
      fs.writeFileSync(marker, '');
    } catch {}
  }
}

const { bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    backgroundColor: '#101218',
    webPreferences: {
      preload: require.resolve('@smartspectra/node-sdk/preload'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  bindSmartSpectraIpc(win);

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('console-message', (e) => {
    if (e && e.message) console.log(`[renderer] ${e.message}`);
  });

  let shuttingDown = false;
  win.on('close', (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    shuttingDown = true;
    win.hide();
    const timeout = new Promise((r) => setTimeout(() => r({ wasMeasuring: true, timedOut: true }), 5000));
    const shutdown = win.webContents
      .executeJavaScript('window.__shutdown ? window.__shutdown() : null')
      .catch((err) => { console.error('[main] renderer shutdown failed:', err); return { wasMeasuring: true }; });
    Promise.race([shutdown, timeout]).then(async (result) => {
      if (result && result.wasMeasuring) await new Promise((r) => setTimeout(r, 3000));
      if (!win.isDestroyed()) win.destroy();
    });
  });

  const query = {};
  if (process.env.MEET_AUTOJOIN) query.autojoin = process.env.MEET_AUTOJOIN;
  if (process.env.MEET_PROFILE) query.noaudio = '1';
  if (process.env.MEET_AUTOCONSENT === '1') query.autoconsent = '1';
  if (process.env.MEET_AUTOPRACTICE === '1') query.autopractice = '1';
  if (process.env.MEET_PERSONA) query.persona = process.env.MEET_PERSONA;
  if (process.env.MEET_SIMULATED === '0' || process.env.MEET_SIMULATED === '1') query.simulated = process.env.MEET_SIMULATED;
  if (process.env.MEET_SDK_TEST === '1' && !app.isPackaged) win.loadFile(path.join(__dirname, 'sdk-test', 'test.html'));
  else win.loadFile(path.join(__dirname, 'index.html'), { query });

  if (process.env.MEET_AUTOQUIT_MS) setTimeout(() => { if (!win.isDestroyed()) win.close(); }, Number(process.env.MEET_AUTOQUIT_MS));

  if (process.env.SMARTSPECTRA_DIAGNOSTICS === '1') win.webContents.openDevTools({ mode: 'detach' });

  if (process.env.MEET_SHOTS) {
    const fs = require('fs');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const shot = async (name) => fs.writeFileSync(path.join(process.env.MEET_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    const click = (sel) => win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(sel)})?.click()`);
    win.webContents.once('did-finish-load', async () => {
      if (process.env.MEET_SHOTS_HOST === '1') {
        await wait(45000); await shot('h-1-cards');
        await click('.botbtn'); await wait(15000); await shot('h-2-after-bot');
        await click('.hcard .icon-btn'); await wait(2000); await shot('h-3-report');
        console.log('[shots] host done');
        win.close();
        return;
      }
      if (process.env.MEET_AUTOPRACTICE === '1') {
        for (const t of [12, 40]) { await wait(t === 12 ? 12000 : 28000); await shot(`p-${t}s`); }
        await click('#btn-p-coach'); await wait(8000); await shot('p-coach-now');
        await click('#btn-p-end'); await wait(12000); await shot('p-summary');
        console.log('[shots] practice done');
        win.close();
        return;
      }
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
