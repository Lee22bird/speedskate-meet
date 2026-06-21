# SpeedSkateMeet Desktop

This directory contains the Electron wrapper for SpeedSkateMeet Desktop.

The desktop app starts the existing Express application locally and loads it in a native macOS window. Browser mode is unchanged: `npm start` still runs the same Express app for normal web use.

## Current Status

- `desktop/main.js` starts SSM locally and opens an Electron `BrowserWindow`.
- `desktop/preload.js` exposes only a tiny, read-only desktop marker.
- `desktop/splash.html` displays while the local Express service starts.
- The renderer loads `http://127.0.0.1:<port>/`.
- Window size and position are remembered in Electron `userData`.
- Desktop data defaults to `userData/ssm_db.json` through `SSM_DATA_FILE`.
- Alpha licensing is shown as `Development Mode`; real validation should connect in `desktop/main.js` before loading the app URL.

## Alpha Packaging

- Packaging tool: `electron-builder`
- Bundle identifier: `com.speedskateleague.speedskatemeet`
- Alpha version: `0.1.0-alpha`
- Build command: `npm run desktop:build`
- App output: `dist/SpeedSkateMeet.app`

The current alpha icon is generated from `desktop/assets/icon-source.png` by `npm run desktop:icon`. If macOS `iconutil` rejects the generated iconset, the script falls back to `desktop/assets/icon.png`, which electron-builder can use for alpha packaging. Final release artwork should provide a purpose-built 1024 x 1024 PNG and reviewed `.icns` with clean padding, no web-only cropping, and a simplified shape that reads clearly in the macOS Dock.

## Security Posture

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- Remote module disabled
- New windows are opened in the system browser instead of inside Electron

## Future Integration Points

- Offline database: replace or wrap the JSON data file with a desktop-safe local store.
- SSL synchronization: add a sync service outside the renderer, then expose limited status through preload.
- Desktop licensing validation: call `/api/license/validate` and `/api/license/activate` during startup.
- Auto updates: add an updater in the main process after packaging and signing are defined.
- HDMI graphics output: add secondary-display window management in `main.js`.
- Timing system integration: add hardware bridges in the main process or a separate local service, never directly in the renderer.
