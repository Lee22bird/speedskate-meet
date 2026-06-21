'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('SpeedSkateMeetDesktop', {
  platform: process.platform,
  desktop: true,
});
