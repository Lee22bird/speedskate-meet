'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SpeedSkateMeetDesktop', {
  platform: process.platform,
  desktop: true,
  licenseStatus: 'Development Mode',
  restart: () => ipcRenderer.invoke('desktop:restart'),
});
