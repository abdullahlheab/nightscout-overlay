'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // overlay window
  onData: (cb) => ipcRenderer.on('overlay:data', (_e, p) => cb(p)),
  onConfig: (cb) => ipcRenderer.on('overlay:config', (_e, c) => cb(c)),
  showMenu: () => ipcRenderer.send('overlay:menu'),
  openSettings: () => ipcRenderer.send('overlay:open-settings'),
  setScale: (s) => ipcRenderer.send('overlay:set-scale', s),
  onAlert: (cb) => ipcRenderer.on('overlay:alert', (_e, a) => cb(a)),
  acknowledgeAlert: () => ipcRenderer.send('overlay:ack'),
  onUpdateNotice: (cb) => ipcRenderer.on('overlay:update-notice', (_e, n) => cb(n)),
  onRank: (cb) => ipcRenderer.on('overlay:rank', (_e, r) => cb(r)),
  previewRank: (tier) => ipcRenderer.send('rank:preview', tier),
  refreshRank: () => ipcRenderer.send('rank:refresh'),
  pickRankDir: () => ipcRenderer.invoke('rank:pick-dir'),
  openRankOverview: () => ipcRenderer.send('rank:overview'),
  // overview window
  onOverview: (cb) => ipcRenderer.on('overview:data', (_e, d) => cb(d)),
  requestOverview: () => ipcRenderer.send('overview:request'),
  closeOverview: () => ipcRenderer.send('overview:close'),
  dismissUpdate: () => ipcRenderer.send('update:dismiss'),
  testAlert: (kind) => ipcRenderer.send('alert:test', kind),
  pickSound: () => ipcRenderer.invoke('alert:pick-sound'),
  // settings window
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (c) => ipcRenderer.invoke('config:set', c),
  testConnection: (draft) => ipcRenderer.invoke('config:test', draft),
  configPath: () => ipcRenderer.invoke('config:path'),
  maxScale: () => ipcRenderer.invoke('overlay:max-scale'),
  onScale: (cb) => ipcRenderer.on('config:scale', (_e, s) => cb(s)),
  closeSettings: () => ipcRenderer.send('settings:close'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  // updates
  updateState: () => ipcRenderer.invoke('update:state'),
  onUpdateState: (cb) => ipcRenderer.on('update:state', (_e, s) => cb(s)),
  checkForUpdates: () => ipcRenderer.send('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  openDownloadPage: () => ipcRenderer.send('update:open')
});
