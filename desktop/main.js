'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 920;
const MIN_WIDTH = 1280;
const MIN_HEIGHT = 800;
const SPLASH_FILE = path.join(__dirname, 'splash.html');
const ICON_FILE = path.join(__dirname, 'assets', 'icon.icns');

let mainWindow = null;
let serverStarted = false;
let lastStartPort = null;

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
  lastStartPort = port;
  process.env.PORT = String(port);
  process.env.SSM_DESKTOP = '1';
  process.env.SSM_DATA_FILE = process.env.SSM_DATA_FILE || userDataPath('ssm_db.json');

  require('../server');
  serverStarted = true;
  await waitForServer(`http://127.0.0.1:${port}/`);

  return port;
}

function safeErrorText(value) {
  return String(value || '').replace(/[<>&]/g, '');
}

function errorHtml({ port, message }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SpeedSkateMeet Startup Error</title>
  <style>
    :root{color-scheme:dark;--orange:#f97316;--text:#e5eefb;--muted:#9fb2c8}
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#07101f,#111827);font-family:Arial,Helvetica,sans-serif;color:var(--text)}
    main{width:min(760px,calc(100vw - 48px));border:1px solid rgba(249,115,22,.35);border-radius:18px;background:rgba(255,255,255,.04);padding:28px;box-shadow:0 24px 70px rgba(0,0,0,.38)}
    h1{margin:0 0 8px;font-size:34px}
    p{color:var(--muted);font-size:16px;line-height:1.55}
    code{display:block;white-space:pre-wrap;border:1px solid rgba(148,163,184,.22);border-radius:12px;background:rgba(0,0,0,.25);padding:14px;color:#fed7aa;margin:16px 0}
    button{border:0;border-radius:999px;background:var(--orange);color:white;font-weight:900;padding:11px 18px;cursor:pointer}
  </style>
</head>
<body>
  <main>
    <h1>SpeedSkateMeet could not start</h1>
    <p>The local meet service did not become available. You can try restarting the desktop app.</p>
    <code>Port: ${safeErrorText(port || 'unknown')}
Error: ${safeErrorText(message || 'Unknown startup error')}</code>
    <button id="restart">Restart SpeedSkateMeet</button>
  </main>
  <script>
    document.getElementById('restart').addEventListener('click', function () {
      if (window.SpeedSkateMeetDesktop && window.SpeedSkateMeetDesktop.restart) {
        window.SpeedSkateMeetDesktop.restart();
      } else {
        location.reload();
      }
    });
  </script>
</body>
</html>`;
}

function createWindow() {
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
    icon: fs.existsSync(ICON_FILE) ? ICON_FILE : undefined,
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

  mainWindow.loadFile(SPLASH_FILE);
  return mainWindow;
}

app.setName('SpeedSkateMeet');
app.setAppUserModelId('com.speedskateleague.speedskatemeet');

app.whenReady().then(async () => {
  createWindow();

  try {
    const port = await startLocalServer();
    await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml({
        port: lastStartPort || process.env.PORT || '',
        message: err && err.message ? err.message : String(err),
      })));
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (serverStarted) mainWindow.loadURL(`http://127.0.0.1:${process.env.PORT || 10000}/`);
    }
  });
}).catch(err => {
  console.error('SpeedSkateMeet Desktop failed to start:', err);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('desktop:restart', () => {
  app.relaunch();
  app.quit();
});
