'use strict';

let electronLog = null;
try {
  electronLog = require('electron-log');
  if (electronLog.transports && electronLog.transports.file) {
    electronLog.transports.file.level = 'info';
  }
  if (electronLog.transports && electronLog.transports.console) {
    electronLog.transports.console.level = 'info';
  }
} catch (err) {
  electronLog = null;
}

// Never log request bodies, passwords, tokens, or full user objects here.
// Pass short, identifying strings (ids, route names, error messages) only.
function info(...args) {
  if (electronLog) electronLog.info(...args);
  else console.log(...args);
}

function warn(...args) {
  if (electronLog) electronLog.warn(...args);
  else console.warn(...args);
}

function error(...args) {
  if (electronLog) electronLog.error(...args);
  else console.error(...args);
}

function debug(...args) {
  if (electronLog) electronLog.debug(...args);
  else console.log(...args);
}

module.exports = { info, warn, error, debug };
