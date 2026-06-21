'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { app, BrowserWindow, shell } = require('electron');

const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 920;
const MIN_WIDTH = 1280;
const MIN_HEIGHT = 800;

let mainWindow = null;
let serverStarted = false;

function userDataPath(...parts) {
  return path.join(app.getPath('userData'), ...parts);
}

function readWindowState() {
  try {
    const filePath = userDataPath(WINDOW_STATE_FILE);
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
  } catch (err) {
    return {};
  }
}

function writeWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(userDataPath(WINDOW_STATE_FILE), JSON.stringify(win.getBounds(), null, 2), 'utf8');
  } catch (err) {
    // Window persistence should never block app shutdown.
  }
}

function portAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function choosePort() {
  const requested = Number(process.env.SSM_DESKTOP_PORT || process.env.PORT || 0);
  if (requested > 0 && await portAvailable(requested)) return requested;

  for (let port = 10000; port < 10050; port += 1) {
    if (await portAvailable(port)) return port;
  }

  throw new Error('No local port available for SpeedSkateMeet Desktop.');
}

function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get(url, res => {
        res.resume();
        resolve();
      });

      req.once('error', err => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(err);
          return;
        }
        setTimeout(ping, 250);
      });

      req.setTimeout(1000, () => req.destroy(new Error('Server startup timed out.')));
    };

    ping();
  });
}

async function startLocalServer() {
  if (serverStarted) return Number(process.env.PORT || 10000);

  const port = await choosePort();
  process.env.PORT = String(port);
  process.env.SSM_DESKTOP = '1';
  process.env.SSM_DATA_FILE = process.env.SSM_DATA_FILE || userDataPath('ssm_db.json');

  require('../server');
  serverStarted = true;
  await waitForServer(`http://127.0.0.1:${port}/`);

  return port;
}

function createWindow(startUrl) {
  const state = readWindowState();

  mainWindow = new BrowserWindow({
    title: 'SpeedSkateMeet',
    width: Math.max(Number(state.width || DEFAULT_WIDTH), MIN_WIDTH),
    height: Math.max(Number(state.height || DEFAULT_HEIGHT), MIN_HEIGHT),
    x: Number.isFinite(Number(state.x)) ? Number(state.x) : undefined,
    y: Number.isFinite(Number(state.y)) ? Number(state.y) : undefined,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', () => writeWindowState(mainWindow));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(startUrl);
}

app.setName('SpeedSkateMeet');

app.whenReady().then(async () => {
  const port = await startLocalServer();
  createWindow(`http://127.0.0.1:${port}/`);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(`http://127.0.0.1:${port}/`);
    }
  });
}).catch(err => {
  console.error('SpeedSkateMeet Desktop failed to start:', err);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
