'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SpeedSkateMeetDesktop', {
  platform: process.platform,
  desktop: true,
  licenseStatus: 'Development Mode',
  restart: () => ipcRenderer.invoke('desktop:restart'),
  updates: {
    status: () => ipcRenderer.invoke('desktop:update:status'),
    checkNow: () => ipcRenderer.invoke('desktop:update:check'),
    installNow: () => ipcRenderer.invoke('desktop:update:install-now'),
    later: () => ipcRenderer.invoke('desktop:update:later'),
    onStatus: callback => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('desktop:update:status', listener);
      return () => ipcRenderer.removeListener('desktop:update:status', listener);
    },
  },
});
