'use strict';

const path = require('path');

const GITHUB_OWNER = process.env.SSM_UPDATE_GITHUB_OWNER || 'Lee22bird';
const GITHUB_REPO = process.env.SSM_UPDATE_GITHUB_REPO || 'speedskate-meet';
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const UPDATE_STATUS_FILE = path.join(__dirname, 'update-status.html');

function normalizeChannel(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'alpha' || raw === 'beta' || raw === 'stable') return raw;
  return '';
}

function channelFromVersion(version) {
  const raw = String(version || '').toLowerCase();
  if (raw.includes('alpha')) return 'alpha';
  if (raw.includes('beta')) return 'beta';
  return 'stable';
}

function updateChannel(app) {
  return normalizeChannel(process.env.SSM_UPDATE_CHANNEL || process.env.UPDATE_CHANNEL)
    || channelFromVersion(app && typeof app.getVersion === 'function' ? app.getVersion() : '');
}

function safeVersion(info) {
  return String(info && info.version ? info.version : '').trim();
}

function createUpdateStatus(channel) {
  return {
    enabled: false,
    channel,
    provider: 'github',
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    state: 'idle',
    message: 'Automatic updates are ready.',
    updateInfo: null,
    progress: null,
    lastCheckedAt: null,
    lastError: null,
    downloaded: false,
  };
}

function initAutoUpdateService({
  app,
  BrowserWindow,
  ipcMain,
  getMainWindow = () => null,
  logger = () => {},
} = {}) {
  const channel = updateChannel(app);
  const status = createUpdateStatus(channel);
  let updateWindow = null;
  let checkTimer = null;
  let promptVersion = '';
  let autoUpdater = null;

  function log(message) {
    logger(`Auto-update: ${message}`);
  }

  function enabled() {
    if (process.env.SSM_DISABLE_AUTO_UPDATES === '1') return false;
    return Boolean(app && (app.isPackaged || process.env.SSM_ENABLE_AUTO_UPDATES === '1'));
  }

  function broadcast() {
    const windows = BrowserWindow ? BrowserWindow.getAllWindows() : [];
    for (const win of windows) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('desktop:update:status', status);
      }
    }
  }

  function setStatus(patch) {
    Object.assign(status, patch);
    broadcast();
  }

  function configureUpdater() {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.logger = {
      info: message => log(String(message)),
      warn: message => log(`Warning: ${message}`),
      error: message => log(`Error: ${message}`),
      debug: message => log(`Debug: ${message}`),
    };
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = channel !== 'stable';
    autoUpdater.channel = channel;
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      private: false,
    });
  }

  function closeUpdateWindow() {
    if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close();
    updateWindow = null;
  }

  function showUpdateReadyPrompt(info) {
    const version = safeVersion(info);
    if (promptVersion === version && updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.focus();
      return;
    }
    promptVersion = version;

    const parent = getMainWindow();
    updateWindow = new BrowserWindow({
      title: 'SSM Desktop Update',
      width: 460,
      height: 320,
      minWidth: 420,
      minHeight: 300,
      resizable: false,
      maximizable: false,
      minimizable: false,
      modal: Boolean(parent && !parent.isDestroyed()),
      parent: parent && !parent.isDestroyed() ? parent : undefined,
      show: false,
      backgroundColor: '#07101f',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        enableRemoteModule: false,
      },
    });

    updateWindow.once('ready-to-show', () => {
      if (updateWindow && !updateWindow.isDestroyed()) updateWindow.show();
      broadcast();
    });
    updateWindow.on('closed', () => {
      updateWindow = null;
    });
    updateWindow.loadFile(UPDATE_STATUS_FILE);
  }

  async function checkForUpdates(reason = 'manual') {
    if (!status.enabled) {
      setStatus({
        state: 'disabled',
        message: 'Automatic updates are disabled in this desktop session.',
      });
      return status;
    }

    setStatus({
      state: 'checking',
      message: 'Checking for SSM Desktop updates...',
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
    });

    try {
      log(`Checking for updates (${reason}) on ${channel} channel.`);
      await autoUpdater.checkForUpdates();
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      setStatus({
        state: 'error',
        message: 'Update check failed.',
        lastError: message,
      });
      log(`Check failed: ${message}`);
    }
    return status;
  }

  function installNow() {
    if (!status.downloaded) return false;
    setStatus({
      state: 'installing',
      message: 'Installing SSM Desktop update...',
    });
    closeUpdateWindow();
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return true;
  }

  function dismissPrompt() {
    closeUpdateWindow();
    setStatus({
      state: status.downloaded ? 'ready' : status.state,
      message: status.downloaded
        ? 'Update downloaded. It will install the next time SSM Desktop restarts.'
        : status.message,
    });
    return true;
  }

  function registerIpc() {
    ipcMain.handle('desktop:update:status', () => status);
    ipcMain.handle('desktop:update:check', () => checkForUpdates('manual'));
    ipcMain.handle('desktop:update:install-now', () => installNow());
    ipcMain.handle('desktop:update:later', () => dismissPrompt());
  }

  function registerEvents() {
    autoUpdater.on('checking-for-update', () => {
      setStatus({
        state: 'checking',
        message: 'Checking for SSM Desktop updates...',
        lastCheckedAt: new Date().toISOString(),
      });
    });

    autoUpdater.on('update-available', info => {
      setStatus({
        state: 'available',
        message: 'A new SSM Desktop update is available. Downloading in the background...',
        updateInfo: info,
        progress: null,
        downloaded: false,
      });
      log(`Update available: ${safeVersion(info) || 'unknown version'}`);
    });

    autoUpdater.on('update-not-available', info => {
      setStatus({
        state: 'current',
        message: 'SSM Desktop is up to date.',
        updateInfo: info || null,
        progress: null,
        downloaded: false,
      });
      log('No update available.');
    });

    autoUpdater.on('download-progress', progress => {
      setStatus({
        state: 'downloading',
        message: 'Downloading SSM Desktop update in the background...',
        progress,
      });
    });

    autoUpdater.on('update-downloaded', info => {
      setStatus({
        state: 'ready',
        message: 'A new version of SSM Desktop is ready.',
        updateInfo: info,
        progress: null,
        downloaded: true,
      });
      log(`Update downloaded: ${safeVersion(info) || 'unknown version'}`);
      showUpdateReadyPrompt(info);
    });

    autoUpdater.on('error', err => {
      const message = err && err.message ? err.message : String(err);
      setStatus({
        state: 'error',
        message: 'Update service error.',
        lastError: message,
      });
      log(`Error: ${message}`);
    });
  }

  function start() {
    status.enabled = enabled();
    status.message = status.enabled
      ? `Automatic updates enabled on ${channel} channel.`
      : 'Automatic updates are disabled until the app is packaged or explicitly enabled.';

    registerIpc();

    if (!status.enabled) {
      log(`Disabled. Channel=${channel}. Packaged=${Boolean(app && app.isPackaged)}.`);
      return { ...status, start, checkForUpdates, installNow, dismissPrompt };
    }

    configureUpdater();
    registerEvents();
    setTimeout(() => checkForUpdates('startup'), 1500);
    checkTimer = setInterval(() => checkForUpdates('scheduled'), FOUR_HOURS_MS);
    if (checkTimer && typeof checkTimer.unref === 'function') checkTimer.unref();
    log(`Enabled. Provider=github repo=${GITHUB_OWNER}/${GITHUB_REPO} channel=${channel}.`);
    return { ...status, start, checkForUpdates, installNow, dismissPrompt };
  }

  return {
    status,
    start,
    checkForUpdates,
    installNow,
    dismissPrompt,
  };
}

module.exports = {
  FOUR_HOURS_MS,
  GITHUB_OWNER,
  GITHUB_REPO,
  initAutoUpdateService,
  normalizeChannel,
  updateChannel,
};
