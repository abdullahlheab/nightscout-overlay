'use strict';
// Auto-update via GitHub Releases (electron-updater). Installed (NSIS) builds download the new
// installer in the background and apply it on restart or quit. Portable builds cannot replace
// themselves, so they only get told a new version exists and where to download it.
const { app, Notification, shell } = require('electron');

const RELEASES_URL = 'https://github.com/abdullahlheab/nightscout-overlay/releases/latest';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 15 * 1000;

let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch { /* not installed: updates disabled */ }

const state = {
  status: 'disabled',   // disabled | idle | checking | none | available | downloading | ready | error
  version: app.getVersion(),
  latest: null,
  percent: 0,
  error: null,
  portable: !!process.env.PORTABLE_EXECUTABLE_FILE
};
const listeners = new Set();

function set(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) { try { fn(get()); } catch { /* ignore */ } }
}
function get() { return { ...state }; }
function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  if (onClick) n.on('click', onClick);
  n.show();
}

function init() {
  if (!app.isPackaged || !autoUpdater) {
    set({ status: 'disabled' });
    return;
  }
  autoUpdater.autoDownload = !state.portable;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => set({ status: 'none' }));
  autoUpdater.on('update-available', (info) => {
    if (state.portable) {
      set({ status: 'available', latest: info.version });
      notify('Nightscout Overlay ' + info.version + ' is available',
        'Click to open the download page. Portable builds cannot update themselves.',
        () => shell.openExternal(RELEASES_URL));
    } else {
      set({ status: 'downloading', latest: info.version, percent: 0 });
    }
  });
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    set({ status: 'ready', latest: info.version, percent: 100 });
    notify('Nightscout Overlay ' + info.version + ' is ready',
      'Click to restart and update now. Otherwise it installs the next time you quit.',
      install);
  });
  autoUpdater.on('error', (e) => set({ status: 'error', error: shortError(e) }));

  set({ status: 'idle' });
  setTimeout(check, FIRST_CHECK_DELAY_MS);
  setInterval(check, CHECK_INTERVAL_MS);
}

// electron-updater errors carry full HTTP headers; keep only something a person can read.
function shortError(e) {
  const msg = ((e && e.message) || String(e)).split('\n')[0].trim();
  if (/^404\b/.test(msg)) return 'No release found on GitHub yet';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR/i.test(msg)) return 'Could not reach GitHub';
  return msg.length > 120 ? msg.slice(0, 117) + '...' : msg;
}

function check() {
  if (state.status === 'disabled' || state.status === 'checking' || state.status === 'downloading') return;
  autoUpdater.checkForUpdates().catch((e) => set({ status: 'error', error: shortError(e) }));
}

function install() {
  if (state.status !== 'ready') return;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
}

function openDownloadPage() { shell.openExternal(RELEASES_URL); }

// Text for the tray menu / settings window.
function describe(s = state) {
  switch (s.status) {
    case 'disabled': return 'Updates are only available in installed builds';
    case 'idle': return 'Check for updates';
    case 'checking': return 'Checking for updates...';
    case 'none': return 'Up to date (v' + s.version + ')';
    case 'available': return 'Version ' + s.latest + ' available. Open download page';
    case 'downloading': return 'Downloading v' + s.latest + '... ' + s.percent + '%';
    case 'ready': return 'Restart to update to v' + s.latest;
    case 'error': return 'Update check failed. Retry';
    default: return 'Check for updates';
  }
}

module.exports = { init, check, install, openDownloadPage, get, onChange, describe, RELEASES_URL };
