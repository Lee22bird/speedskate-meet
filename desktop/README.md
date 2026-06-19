# Desktop Foundation

This directory is reserved for a future SpeedSkateMeet Desktop Edition.

The desktop app is expected to use Electron initially, with:

- `main.js` as the Electron main process entry point.
- `preload.js` as the safe bridge between the renderer and local desktop APIs.
- The existing web application behavior preserved until desktop work is explicitly started.

Current status:

- Electron is not installed.
- No desktop startup logic is implemented.
- No web routes, race logic, registration logic, SSO, or SSL integration are changed by this foundation.

Future work should keep desktop-specific code in this directory and move reusable meet logic into `src/core` only when that migration is planned and tested.
