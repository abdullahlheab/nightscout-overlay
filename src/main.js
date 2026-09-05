'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, globalShortcut, screen, shell, Notification, dialog } = require('electron');
const path = require('path');
const store = require('./config');
const ns = require('./nightscout');
const updater = require('./updater');
const alerts = require('./alerts');

// Alert chimes are played by the overlay page without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Lets a dev copy run next to an installed one: separate config and single-instance lock.
if (process.env.NS_OVERLAY_USER_DATA) app.setPath('userData', process.env.NS_OVERLAY_USER_DATA);

let config = null;
let overlayWin = null;
let settingsWin = null;
let tray = null;
let pollTimer = null;
let statusCache = null;
let lastPayload = null;
let hidden = false;
let activeAlert = null;
let updateNotice = null;   // { version, ready } shown as a bar in the overlay

const ASSETS = path.join(__dirname, '..', 'assets');
const PRELOAD = path.join(__dirname, 'preload.js');

// ---------- sizing ----------
function overlaySize() {
  const s = Number(config.scale) || 1;
  const w = 170;
  const h = 62 + (config.showGraph ? 44 : 0) + (activeAlert ? 30 : 0) + (updateNotice ? 30 : 0);
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  const { width } = overlaySize();
  return { x: workArea.x + workArea.width - width - 16, y: workArea.y + 16 };
}

function clampToScreen(pos) {
  const { width, height } = overlaySize();
  const d = screen.getDisplayMatching({ x: pos.x, y: pos.y, width, height });
  const a = d.workArea;
  return {
    x: Math.min(Math.max(pos.x, a.x), a.x + a.width - width),
    y: Math.min(Math.max(pos.y, a.y), a.y + a.height - height)
  };
}

// ---------- overlay window ----------
function createOverlay() {
  const { width, height } = overlaySize();
  const pos = clampToScreen(config.position || defaultPosition());

  overlayWin = new BrowserWindow({
    width, height, x: pos.x, y: pos.y,
    // Windows enforces a ~136px minimum on windows with no explicit minimum, which blocked shrinking
    minWidth: 1, minHeight: 1,
    thickFrame: false,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true }
  });

  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setMenu(null);
  overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));

  overlayWin.once('ready-to-show', () => {
    overlayWin.show();
    applyClickThrough();
    pushToOverlay();
  });

  let moveTimer = null;
  overlayWin.on('moved', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!overlayWin) return;
      const [x, y] = overlayWin.getPosition();
      config.position = { x, y };
      store.save(config);
    }, 300);
  });

  overlayWin.on('closed', () => { overlayWin = null; });
}

function applyClickThrough() {
  if (!overlayWin) return;
  // An active alert or update notice always takes the mouse so its buttons can be clicked.
  overlayWin.setIgnoreMouseEvents(!!config.clickThrough && !activeAlert && !updateNotice, { forward: true });
  updateTray();
}

function pushToOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.webContents.send('overlay:config', publicConfig());
  if (lastPayload) overlayWin.webContents.send('overlay:data', lastPayload);
  overlayWin.webContents.send('overlay:alert', activeAlert);
  overlayWin.webContents.send('overlay:update-notice', updateNotice);
}

function publicConfig() {
  const { token, ...rest } = config;
  return { ...rest, hasToken: !!token };
}

function resizeOverlay() {
  if (!overlayWin) return;
  const { width, height } = overlaySize();
  const [x, y] = overlayWin.getPosition();
  const p = clampToScreen({ x, y });
  overlayWin.setMinimumSize(1, 1);
  overlayWin.setBounds({ x: p.x, y: p.y, width, height });
}

// ---------- polling ----------
async function poll() {
  if (!config.url) {
    lastPayload = { error: 'Set your Nightscout URL in Settings', history: [] };
    pushToOverlay();
    return;
  }
  try {
    const { payload, status } = await ns.fetchPayload(config, statusCache);
    statusCache = status;
    lastPayload = payload;
  } catch (e) {
    lastPayload = { ...(lastPayload || { history: [] }), error: e.message || String(e), fetchedAt: Date.now() };
    statusCache = null; // re-fetch server settings next time in case URL/token changed
  }
  const nextAlert = alerts.evaluate(lastPayload, config).show;
  // a test alert stays until dismissed; a real one replaces it
  if (nextAlert || !(activeAlert && activeAlert.type === 'test')) applyAlert(nextAlert);
  pushToOverlay();
  updateTray();
  // Some fullscreen apps steal the top spot; re-assert it.
  if (overlayWin && !hidden) overlayWin.setAlwaysOnTop(true, 'screen-saver');
}

// ---------- alerts ----------
// Attach how the chime should sound (style, custom file, volume) so the renderer needs no config.
function decorate(alert) {
  if (!alert) return null;
  const a = config.alerts || {};
  return { ...alert, style: a.sound || 'chime', file: a.sound === 'custom' ? (a.customSound || '') : '', volume: Number(a.volume) };
}

function applyAlert(alert) {
  alert = decorate(alert);
  const wasActive = !!activeAlert;
  // The sound flag is one-shot: it goes to the page exactly once. What we keep (and re-send on
  // resize, config changes and polls) has it cleared, otherwise the chime replays. Fixes #1.
  activeAlert = alert ? { ...alert, sound: null } : null;
  if (wasActive !== !!alert) { resizeOverlay(); applyClickThrough(); }
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('overlay:alert', alert);
  if (alert && alert.sound && (hidden || config.alerts.notify) && Notification.isSupported()) {
    new Notification({ title: 'Nightscout Overlay', body: alert.message, silent: true }).show();
  }
}

// ---------- in-overlay update notice ----------
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function computeUpdateNotice() {
  const u = updater.get();
  if (u.status !== 'ready' && u.status !== 'available') return null;
  const d = config.updateDismissed;
  if (d && d.version === u.latest && Date.now() < d.until) return null;
  return { version: u.latest, ready: u.status === 'ready' };
}

function refreshUpdateNotice() {
  const next = computeUpdateNotice();
  const changed = JSON.stringify(next) !== JSON.stringify(updateNotice);
  updateNotice = next;
  if (changed) { resizeOverlay(); applyClickThrough(); }
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('overlay:update-notice', updateNotice);
}

// "Later": hide the notice for a week, or until a newer version shows up.
function dismissUpdateNotice() {
  if (!updateNotice) return;
  config.updateDismissed = { version: updateNotice.version, until: Date.now() + DISMISS_MS };
  store.save(config);
  refreshUpdateNotice();
}

function acknowledgeAlert() {
  alerts.acknowledge(config);
  applyAlert(null);
}

function startPolling() {
  clearInterval(pollTimer);
  poll();
  const ms = Math.max(15, Number(config.refreshSeconds) || 60) * 1000;
  pollTimer = setInterval(poll, ms);
}

// ---------- settings window ----------
function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 500, height: 720,
    title: 'Nightscout Overlay Settings',
    resizable: true,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------- tray ----------
function trayTitle() {
  if (!lastPayload || lastPayload.error) return 'Nightscout Overlay v' + app.getVersion();
  return lastPayload.display + ' ' + lastPayload.units + ' ' + lastPayload.arrow +
    '  ' + lastPayload.deltaDisplay + '  (' + lastPayload.ageMin + 'm ago)';
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: trayTitle(), enabled: false },
    { type: 'separator' },
    { label: 'Settings...', click: openSettings },
    { label: 'Refresh now', click: poll },
    { label: 'I see it (dismiss alert)', visible: !!activeAlert, click: acknowledgeAlert },
    updateMenuItem(),
    { type: 'separator' },
    { label: 'Click-through (Ctrl+Alt+G)', type: 'checkbox', checked: !!config.clickThrough, click: toggleClickThrough },
    { label: 'Hide overlay (Ctrl+Alt+H)', type: 'checkbox', checked: hidden, click: toggleHidden },
    { label: 'Reset position', click: () => {
      config.position = null; store.save(config);
      if (overlayWin) { const p = defaultPosition(); overlayWin.setPosition(p.x, p.y); }
    } },
    { type: 'separator' },
    { label: 'Open Nightscout site', enabled: !!config.url, click: () => shell.openExternal(config.url) },
    { label: 'Quit', click: () => app.quit() }
  ]);
}

function updateMenuItem() {
  const u = updater.get();
  const item = { label: updater.describe(u), enabled: true };
  switch (u.status) {
    case 'disabled': case 'checking': case 'downloading': item.enabled = false; break;
    case 'ready': item.click = updater.install; break;
    case 'available': item.click = updater.openDownloadPage; break;
    default: item.click = updater.check;
  }
  return item;
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  tray = new Tray(img);
  tray.on('click', toggleHidden);
  updateTray();
}

function updateTray() {
  if (!tray) return;
  tray.setToolTip(trayTitle());
  tray.setContextMenu(buildMenu());
}

function toggleClickThrough() {
  config.clickThrough = !config.clickThrough;
  store.save(config);
  applyClickThrough();
  pushToOverlay();
}

function toggleHidden() {
  if (!overlayWin) return;
  hidden = !hidden;
  if (hidden) overlayWin.hide();
  else { overlayWin.show(); overlayWin.setAlwaysOnTop(true, 'screen-saver'); }
  updateTray();
}

// ---------- IPC ----------
ipcMain.handle('config:get', () => config);
ipcMain.handle('config:set', (_e, next) => {
  const before = config;
  config = { ...before, ...next,
    thresholds: { ...before.thresholds, ...(next.thresholds || {}) },
    alerts: { ...before.alerts, ...(next.alerts || {}) } };
  // Do not reset the alert engine here: the next poll re-evaluates with the new settings, so a
  // condition that is still active keeps its bar without re-chiming, and a disabled one clears.
  store.save(config);
  statusCache = null;
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!config.openAtLogin });
  resizeOverlay();
  applyClickThrough();
  pushToOverlay();
  startPolling();
  return config;
});
ipcMain.handle('config:test', async (_e, draft) => {
  try { return await ns.testConnection({ ...config, ...draft }); }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
});
ipcMain.handle('config:path', () => store.file());
ipcMain.handle('update:state', () => ({ ...updater.get(), text: updater.describe() }));
ipcMain.on('update:check', () => updater.check());
ipcMain.on('update:install', () => updater.install());
ipcMain.on('update:open', () => updater.openDownloadPage());
let scaleSaveTimer = null;
ipcMain.on('overlay:set-scale', (_e, scale) => {
  const s = Math.min(3, Math.max(0.5, Number(scale) || 1));
  if (Math.abs(s - config.scale) < 0.001) return;
  config.scale = Math.round(s * 100) / 100;
  resizeOverlay();
  pushToOverlay();
  clearTimeout(scaleSaveTimer);
  scaleSaveTimer = setTimeout(() => store.save(config), 400);
});
ipcMain.on('overlay:menu', () => {
  if (overlayWin) buildMenu().popup({ window: overlayWin });
});
ipcMain.on('overlay:open-settings', openSettings);
ipcMain.on('overlay:ack', acknowledgeAlert);
ipcMain.on('update:dismiss', dismissUpdateNotice);
ipcMain.on('alert:test', (_e, kind) => {
  const units = (lastPayload && lastPayload.units) || (config.units === 'mmol' ? 'mmol' : 'mg/dl');
  applyAlert(alerts.testAlert(kind, units));
});
ipcMain.handle('alert:pick-sound', async () => {
  const r = await dialog.showOpenDialog(settingsWin || undefined, {
    title: 'Choose an alert sound',
    filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'flac'] }],
    properties: ['openFile']
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});
ipcMain.on('settings:close', () => { if (settingsWin) settingsWin.close(); });
ipcMain.on('open-external', (_e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });

// ---------- lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', openSettings);

  app.whenReady().then(() => {
    config = store.load();
    createTray();
    createOverlay();
    startPolling();
    updater.init();
    updater.onChange((u) => {
      updateTray();
      refreshUpdateNotice();
      if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('update:state', { ...u, text: updater.describe(u) });
    });

    globalShortcut.register('CommandOrControl+Alt+G', toggleClickThrough);
    globalShortcut.register('CommandOrControl+Alt+H', toggleHidden);
    globalShortcut.register('CommandOrControl+Alt+S', openSettings);

    setInterval(refreshUpdateNotice, 60 * 60 * 1000); // brings a dismissed notice back after a week

    if (!config.url) openSettings();

    screen.on('display-metrics-changed', () => {
      if (!overlayWin) return;
      const [x, y] = overlayWin.getPosition();
      const p = clampToScreen({ x, y });
      overlayWin.setPosition(p.x, p.y);
    });
  });

  // Keep running in the tray when windows close.
  app.on('window-all-closed', () => {});
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
