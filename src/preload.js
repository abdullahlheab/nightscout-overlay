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
  testAlert: () => ipcRenderer.send('alert:test'),
  // settings window
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (c) => ipcRenderer.invoke('config:set', c),
  testConnection: (draft) => ipcRenderer.invoke('config:test', draft),
  configPath: () => ipcRenderer.invoke('config:path'),
  closeSettings: () => ipcRenderer.send('settings:close'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  // updates
  updateState: () => ipcRenderer.invoke('update:state'),
  onUpdateState: (cb) => ipcRenderer.on('update:state', (_e, s) => cb(s)),
  checkForUpdates: () => ipcRenderer.send('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  openDownloadPage: () => ipcRenderer.send('update:open')
});
