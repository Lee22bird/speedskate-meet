'use strict';

const UPDATE_URL = 'https://downloads.speedskateleague.com/ssm/';

function initAutoUpdateScaffold({ app, logger = () => {} } = {}) {
  const enabled = process.env.SSM_ENABLE_AUTO_UPDATES === '1';
  const status = {
    enabled,
    provider: 'generic',
    url: UPDATE_URL,
  };

  if (!enabled) {
    logger(`Auto-update scaffold ready; production checks disabled. Future feed: ${UPDATE_URL}`);
    return status;
  }

  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_URL });
    autoUpdater.on('error', err => logger(`Auto-update check failed: ${err && err.message ? err.message : err}`));
    autoUpdater.on('update-available', info => logger(`Auto-update available: ${info && info.version ? info.version : 'unknown version'}`));
    autoUpdater.on('update-not-available', () => logger('Auto-update check completed; no update available.'));
    autoUpdater.checkForUpdates();
    return { ...status, checkerStarted: true };
  } catch (err) {
    logger(`Auto-update scaffold could not start: ${err && err.message ? err.message : err}`);
    return { ...status, checkerStarted: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  UPDATE_URL,
  initAutoUpdateScaffold,
};
