const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('triarchy', {
  getSites: () => ipcRenderer.invoke('get-sites'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: settings => ipcRenderer.invoke('save-settings', settings),
  // AI 에이전트·스크립트 제어용 (명령줄 옵션, state.json)
  getStartupCommands: () => ipcRenderer.invoke('get-startup-commands'),
  onControl: cb => ipcRenderer.on('control', (_e, cmd) => cb(cmd)),
  reportState: state => ipcRenderer.invoke('report-state', state)
});
