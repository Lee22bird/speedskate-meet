# SpeedSkateMeet Desktop macOS Release

This document describes the professional macOS release workflow for SSM Desktop.

This is release infrastructure only. It does not change race generation, timing, beam break handling, meet workflow, database schema, SSL APIs, or meet operations.

## Prerequisites

- Apple Developer account is active.
- Developer ID Application certificate is installed in Keychain.
- Xcode command line tools are installed.
- Apple notarization credentials are available as environment variables.

Required notarization variables:

```sh
export APPLE_ID="apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="6HJDJ6HCG7"
```

Do not commit these values.

## Build Commands

Development desktop launch:

```sh
npm run desktop:dev
```

Package an unsigned/signed app folder for local inspection:

```sh
npm run package:mac
```

Build Apple Silicon release artifacts:

```sh
npm run build:mac
```

Optional Intel build:

```sh
npm run build:mac:intel
```

Build and notarize the DMG:

```sh
npm run release:mac
```

The generic `npm run build` command is an alias for `npm run build:mac`.

## Output Structure

Release artifacts are organized as:

```text
release/
  mac/         Electron Builder output
  dmg/         DMG mirror for release review
  notarized/   Stapled, notarized DMG copy
```

The expected DMG name is:

```text
SSM Desktop.dmg
```

## Signing

Signing is configured in `electron-builder.yml`.

The build does not hardcode a certificate name. Electron Builder should auto-discover the installed Developer ID Application identity from Keychain.

Current verified identity:

```text
Developer ID Application: Lee Bird (6HJDJ6HCG7)
```

To inspect the signed app:

```sh
codesign --verify --deep --strict --verbose=2 "release/mac/mac-arm64/SpeedSkateMeet.app"
codesign --display --verbose=4 "release/mac/mac-arm64/SpeedSkateMeet.app"
```

To inspect the signed DMG:

```sh
codesign --verify --verbose=2 "release/mac/SSM Desktop.dmg"
spctl --assess --type open --context context:primary-signature --verbose "release/mac/SSM Desktop.dmg"
```

## Notarization

Electron Builder runs `scripts/notarize-mac.js` after app signing when all notarization environment variables are present.

`npm run notarize` submits the built DMG with `xcrun notarytool`, waits for the result, staples the ticket, and copies the stapled DMG to:

```text
release/notarized/SSM Desktop.dmg
```

To skip app notarization during local package checks:

```sh
export SSM_SKIP_NOTARIZE=1
```

## DMG Appearance

The DMG is configured with:

- SSM Desktop title
- SSM app icon
- SSM branded background
- Drag-to-Applications layout

Configuration lives in `electron-builder.yml`.

The current background uses existing SSM branding artwork. Before public release, replace it with a purpose-built 660 x 420 DMG background image that includes dark SSM styling, clear contrast, and no small text.

## Auto Updates

Auto-update architecture is scaffolded but disabled by default.

Future update feed:

```text
https://downloads.speedskateleague.com/ssm/
```

The dormant hook lives in:

```text
desktop/updateService.js
```

Production update checks only start if:

```sh
export SSM_ENABLE_AUTO_UPDATES=1
```

Before enabling production updates, add `electron-updater` as a direct dependency and publish signed update metadata to the download feed.

## Release Workflow

1. Confirm the app launches locally:

   ```sh
   npm run desktop:dev
   ```

2. Run validation:

   ```sh
   node --check desktop/main.js
   node --check desktop/preload.js
   node --check desktop/updateService.js
   node --check scripts/notarize-mac.js
   node --check scripts/collect-mac-artifacts.js
   node --test
   git diff --check
   ```

3. Build Apple Silicon artifacts:

   ```sh
   npm run build:mac
   ```

4. Verify signing:

   ```sh
   codesign --verify --deep --strict --verbose=2 "release/mac/mac-arm64/SpeedSkateMeet.app"
   spctl --assess --type execute --verbose "release/mac/mac-arm64/SpeedSkateMeet.app"
   ```

5. Notarize and staple:

   ```sh
   npm run notarize
   ```

6. Test the final DMG from:

   ```text
   release/notarized/SSM Desktop.dmg
   ```

## Troubleshooting

If signing identity is not found:

```sh
security find-identity -v -p codesigning
```

If notarization fails:

```sh
xcrun notarytool history --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD"
```

If Gatekeeper rejects the app:

```sh
spctl --assess --type execute --verbose "release/mac/mac-arm64/SpeedSkateMeet.app"
```

If the DMG does not staple:

```sh
xcrun stapler validate "release/mac/SSM Desktop.dmg"
```

## Manual Apple Configuration Still Required

- Create and store an Apple app-specific password.
- Provide notarization environment variables in the release shell or CI secret store.
- Decide where release artifacts are hosted under `https://downloads.speedskateleague.com/ssm/`.
- Replace the interim DMG background with final production artwork before public release.
- Decide when to enable production auto-update checks.
