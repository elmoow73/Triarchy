const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('triarchy', {
  getSites: () => ipcRenderer.invoke('get-sites'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: settings => ipcRenderer.invoke('save-settings', settings)
});
