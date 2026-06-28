# SpeedSkateMeet Desktop — macOS Release Guide

This is the top-level entry point for building, signing, notarizing, and
distributing a downloadable macOS beta of SSM Desktop.

This document is packaging/release infrastructure only. It does not change
race generation, timing, meet workflows, the database, or SSL integration.

For deeper background on the signing/notarization design and the
auto-update channel system, see [docs/mac-release.md](docs/mac-release.md)
and [docs/desktop-updates.md](docs/desktop-updates.md). This file is the
condensed, step-by-step version for cutting a release.

## 1. Required Apple Developer account items

- An active **Apple Developer Program** membership (paid, individual or org).
- A **Developer ID Application** certificate for your Team ID, issued from
  that account and installed in your local macOS Keychain (see below).
- Notarization credentials — **prefer an App Store Connect API key**
  over an Apple ID + app-specific password (see §3). Generate one at
  [App Store Connect → Users and Access → Integrations → Team Keys](https://appstoreconnect.apple.com/access/integrations/api).

## 2. Required local Keychain certificate

1. In Xcode (or via the Apple Developer portal), create/download a
   **Developer ID Application** certificate for your Team ID and install it
   in `login` keychain (double-click the `.cer`/`.p12`).
2. Confirm it's discoverable:

   ```sh
   security find-identity -v -p codesigning
   ```

   You should see something like:

   ```text
   1) ABCDEF1234567890ABCDEF1234567890ABCDEF12 "Developer ID Application: Your Name (TEAMID1234)"
   ```

3. `electron-builder.yml` does **not** hardcode a certificate name —
   electron-builder auto-discovers this identity from Keychain at build time.
   Nothing in this repo references a specific certificate fingerprint.

## 3. Required environment variables

Set these in your shell before building. **Never commit them** — there is no
`.env` file checked in, and none should be added. No private keys, `.p8`
files, passwords, or certificates belong in this repository.

### Preferred: App Store Connect API key

```sh
export APPLE_API_KEY="/absolute/path/to/AuthKey_XXXXXXXXXX.p8"   # the .p8 file itself, kept outside the repo
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="00000000-0000-0000-0000-000000000000"
```

This is Apple's recommended approach for automated/CI builds — the key
doesn't expire the way an app-specific password can, and it isn't tied to a
personal Apple ID login.

### Fallback: Apple ID + app-specific password

```sh
export APPLE_ID="apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # generate at appleid.apple.com
export APPLE_TEAM_ID="6HJDJ6HCG7"
```

`scripts/notarize-mac.js` checks for the API key variables first and falls
back to the Apple ID/password set automatically — you only need to set one
of the two groups.

### Optional

```sh
export SSM_SKIP_NOTARIZE=1   # skip notarization entirely for a local/dev build
export GH_TOKEN="..."        # only needed if publishing release assets to GitHub Releases
```

## 4. Exact build command

```sh
npm run build:mac
```

This:
- regenerates the `.icns` icon (`desktop:icon`),
- builds the arm64 `.app`, `.dmg`, and `.zip` (zip is required for
  `electron-updater`'s differential update checks),
- code-signs with hardened runtime + entitlements using whatever Developer ID
  Application identity electron-builder finds in Keychain,
- stages the build under `/private/tmp/ssm-desktop-release/mac` (this avoids
  a known issue where macOS file-provider extended attributes on synced
  folders, e.g. iCloud Drive, break Developer ID signing) and copies the
  final artifacts back into `release/mac/`.

`npm run dist:mac` is an alias for the same command.

To notarize and staple in one step after building:

```sh
npm run release:mac
```

Or notarize an already-built DMG on its own:

```sh
npm run notarize:mac
```

(`npm run notarize` still works too — `notarize:mac` is just the more
discoverable alias.)

Output layout:

```text
release/
  mac/         electron-builder output (.app, .dmg, .zip, update metadata)
  dmg/         DMG mirror for review
  notarized/   final stapled, notarized DMG — this is what you distribute
```

The expected DMG name is `SSM Desktop.dmg`.

## 5. How to verify the app is signed

```sh
codesign --verify --deep --strict --verbose=2 "release/mac/mac-arm64/SpeedSkateMeet.app"
codesign --display --verbose=4 "release/mac/mac-arm64/SpeedSkateMeet.app"
```

The second command's output should show:
- `Authority=Developer ID Application: <Your Name/Org> (<TEAMID>)`
- `flags=0x10000(runtime)` — confirms hardened runtime is enabled

To check the DMG itself:

```sh
codesign --verify --verbose=2 "release/mac/SSM Desktop.dmg"
spctl --assess --type open --context context:primary-signature --verbose "release/mac/SSM Desktop.dmg"
```

`spctl` should report `accepted`.

## 6. How to verify notarization

After `npm run release:mac` (or `npm run notarize:mac`):

```sh
xcrun stapler validate "release/notarized/SSM Desktop.dmg"
spctl --assess --type execute --verbose "release/mac/mac-arm64/SpeedSkateMeet.app"
```

Both should report acceptance with a notarization ticket present. You can
also look up notarization history directly with Apple:

```sh
# API key credentials
xcrun notarytool history --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER"

# Apple ID credentials
xcrun notarytool history --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD"
```

## 7. How to test on a clean Mac

See the full checklist in [§8](#8-clean-machine-smoke-test-checklist) below.
In short: copy `release/notarized/SSM Desktop.dmg` to a Mac that has never
had this app or its dev environment installed, open it, drag the app to
Applications, and launch it from there (not from the DMG) — Gatekeeper
behaves differently for apps run directly out of a mounted DMG vs. installed
into `/Applications`.

## 8. Clean-machine smoke test checklist

Run through this on a Mac that is not your development machine (or at least
a fresh user account) before sending a build to anyone else.

- [ ] **Install from DMG** — double-click `SSM Desktop.dmg`, drag
      `SpeedSkateMeet.app` to `/Applications`, eject the DMG.
- [ ] **First launch shows no Gatekeeper warning** — launch from
      `/Applications`, not from the mounted DMG. A properly signed and
      notarized build opens with a normal "first launch" dialog at most
      (app name + "downloaded from the internet"), never an "unidentified
      developer" block.
- [ ] **Create a test meet** — go through meet creation, add at least one
      registration, generate races.
- [ ] **Close and reopen the app** — fully quit (Cmd+Q), relaunch from
      `/Applications`.
- [ ] **Confirm data persists** — the meet and registration created above
      are still there after relaunch.
- [ ] **Attempt a second launch while the app is already running** — open
      the app again (Spotlight, Dock, or double-click in Finder) without
      quitting the first instance.
- [ ] **Confirm the second instance is blocked** — no second window/process
      appears; the existing window comes to the front instead. (This is the
      single-instance lock added in the Priority 1 hardening pass.)
- [ ] **Export results** — use the time trial CSV export or the results
      print page for the test meet and confirm a file is produced/opens
      correctly.
- [ ] **Check the log location** — confirm log output exists at
      `~/Library/Application Support/SpeedSkateMeet/desktop.log` and via
      electron-log's own log file (`~/Library/Logs/SpeedSkateMeet/main.log`),
      and that neither contains passwords, tokens, or full request bodies.
- [ ] **Quit cleanly** — Cmd+Q, confirm no crash dialog, confirm relaunch
      afterward shows a normal (not "recovered from crash") startup.

## 9. Distributing the DMG safely

- Only distribute the **stapled, notarized** DMG from `release/notarized/`,
  never an unsigned or un-notarized build from `release/mac/` directly.
- Don't email the DMG as an attachment if avoidable — many mail providers
  strip or quarantine `.dmg` files. Use a direct download link instead.
- Serve it over HTTPS. If/when you add a "Download" page on
  speedskatemeet.com, link directly to the notarized DMG (ideally uploaded
  to GitHub Releases, which `electron-updater` already reads from — see
  [docs/desktop-updates.md](docs/desktop-updates.md)) rather than hosting a
  second copy that can drift out of sync with the auto-update channel.
- Tell beta testers the **exact filename** (`SSM Desktop.dmg`) so they
  recognize a legitimate copy vs. a renamed/tampered one.
- Keep `release/notarized/` (or wherever you publish from) limited to one
  build per version — don't let stale unsigned test builds sit next to the
  real release artifact where someone could grab the wrong one.

## Known remaining blockers before handing this to another Mac user

- **No Apple notarization credentials are configured in this environment
  yet.** Both credential paths above require values from your own Apple
  Developer account; nothing in the repo can notarize without them.
- **No public download surface exists yet.** Right now the only way to get
  the DMG to a tester is to hand them the file directly (AirDrop, direct
  link, USB). A "Download" page on speedskatemeet.com is the natural next
  step — link it at the notarized DMG in GitHub Releases so auto-update and
  the website always point at the same artifact.
- **DMG background art is interim** (per `docs/mac-release.md`) — fine for a
  beta, worth replacing before a public/stable release.
- **Windows and Linux are intentionally out of scope** for this pass.
