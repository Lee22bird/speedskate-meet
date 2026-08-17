# SSM for iOS (iPhone companion + iPad meet-running app)

One adaptive app, two deliberate experiences:

- **iPhone = the barebones companion.** Find a Meet, Live Race Day, Live
  Board, Results, and minimal staff race-day controls. Nothing else, by
  design.
- **iPad = the SSM meet-running software.** A `NavigationSplitView` command
  center for actually running a meet at the rink: Director race-day control
  (advance/pause/jump/unlock), **Tabulator result entry** (finish-order tap
  tray, place/time/record, DQ details), **Correction Mode** (closed races
  only, required reason, audit trail), **Block Builder** (Race Day Prep
  stepper, generate League/Nationals schedules with the replace/append
  confirm flow, add blocks & break/lunch/awards/practice dividers, rename /
  day / notes / est-minutes editing, move/reorder blocks, per-race nudge +
  move menus, multi-select bulk moves, merge/unmerge with website-identical
  badges, unassigned pool with search/class/distance filters + select-all,
  live time chips using the site's exact pace math), Announcer + Referee
  read boards, Live Board, Results, **Registered** (division-grouped roster
  with the site's exact ready-for-race-generation math, filters, and a
  native Add/Edit Racer sheet with live cost preview), and **Check-In**
  (race-day front desk: stat band, quick filters, attention-sorted queue,
  paid/check-in toggles, helmet editor, needs-attention rail, walk-up adds,
  and the bulk mark-paid / reassign-helmets actions). The device decides at
  launch (`RootTabView` → `PadRootView` on iPad); the iPhone experience is
  untouched.

This iPhone/iPad feature asymmetry is intentional (per the workspace parity
rules: leave a note when platforms deliberately diverge). A future SSM
Android tablet build should match the iPad scope. iPad phase 2 remaining:
Time Trials running, re-randomize lanes, finalize/reopen, score-sheet
printing. Block Builder access matches the
website: directors always, plus anyone the server's canEditMeet gate allows
(assigned tabulators), via the staff-access API's additive `canBuildBlocks`
field.

## How the iPad app talks to the server — zero server changes

Every iPad screen drives the **existing** SSM Express server; nothing was
added or changed server-side for it:

| iPad feature | Existing endpoint |
|---|---|
| Race-day state + race list | `GET /api/v1/meets/:id/race-day-state` |
| Advance / pause / jump / unlock | `POST /api/meet/:id/race-day/{step,toggle-pause,set-current,unlock-race}` |
| Result entry (Save / Close & Advance) | `POST /portal/meet/:id/race-day/judges/save` with `ajax=1` (the site's own AJAX mode) |
| Full race detail (resultsMode, notes, all lanes) | `GET /portal/meet/:id/desktop-export` |
| Correction Mode | `POST /portal/meet/:id/race-day/correction/save` (302 = success, browser semantics) |

Scoring, heat→semi→final progression, permissions, and validation all stay
server-side — the app posts the same form fields the website posts and
re-reads state. `APIClient` gained a redirect-suppressing portal request so
a `302 → /admin/login` surfaces as "session expired" instead of an
undecodable HTML page.

Debug builds honor an `SSM_BASE_URL` environment variable (e.g. launch the
simulator with `SIMCTL_CHILD_SSM_BASE_URL=http://127.0.0.1:10000`) to point
at a local server; release builds always use production.

## The iPhone companion scope

The iPhone side covers exactly five things:

1. Find a Meet
2. Live Race Day (public)
3. Live Board (simplified, glance-friendly view — toggle inside Live Race Day)
4. Results
5. Logged-in Race Day Staff controls, gated by the user's assigned role

It does **not** include Meet Builder, Open/Quad/Relay/Block Builder, Submit a
Meet/Rink, Rinks, About, Help, the admin portal, or any desktop-only tools.
None of that exists on the phone, by design.

## What this is

A SwiftUI source package at `ios/SSMCompanion` (Swift Package Manager). It
talks to the existing SSM Express server over HTTPS/JSON — it does not
reimplement scoring, race generation, or permissions. Every screen either:

- calls a small new JSON API added at `routes/mobileApiRoutes.js`, which
  itself just calls the same service functions the website already uses
  (`computeMeetStandings`, `currentRaceInfo`, `canEditMeet`, etc.), or
- calls the website's **existing** race-day control endpoints directly
  (`/api/meet/:meetId/race-day/set-current`, `/step`, `/toggle-pause`,
  `/unlock-race`) — those already returned JSON before this app existed.

Authentication reuses the website's existing session-cookie system
(`POST /admin/login` sets the `ssm_sess` cookie). The app does not invent a
separate login system or token format — `URLSession`'s shared cookie storage
carries the same cookie a browser would use.

## Project layout

```
ios/
  SSMCompanion/                  Swift Package (the actual app code)
    Package.swift
    Sources/SSMCompanion/
      Models/Models.swift        Codable structs matching the JSON API exactly
      Services/APIClient.swift   Networking layer (async/await, URLSession)
      ViewModels/                 ObservableObject view models per screen
      Views/                      SwiftUI views
      Theme/SSMTheme.swift        SSM brand colors (navy/orange/sky) + cards
      SSMCompanionApp.swift       App entry point (SwiftUI `App`)
  README.md                      This file
```

## Running it in Xcode

1. Open Xcode → **File → Open...** → select `ios/SSMCompanion` (the folder
   containing `Package.swift`). Xcode will open it as a Swift package.
2. To run it as an actual iPhone app, create a new iOS App project (**File →
   New → Project → iOS → App**), then in that project add this package as a
   local dependency: **File → Add Package Dependencies… → Add Local…** and
   pick the `ios/SSMCompanion` folder.
3. In your new App project's `@main` App struct, replace its body with:
   ```swift
   import SSMCompanion

   @main
   struct SSMCompanionHostApp: App {
       var body: some Scene {
           WindowGroup {
               RootTabView()
           }
       }
   }
   ```
4. Set the API base URL (see below), then build and run on a simulator or
   device (⌘R).

This two-step setup (package + thin host app) is the standard way to develop
an iOS app's logic as a testable Swift package while still producing a real
signable `.app`. It's also why this repo doesn't include a checked-in
`.xcodeproj` — Xcode generates that wrapper for you in step 2, and it's
your provisioning/signing configuration, not shared app logic.

### Verifying it compiles without opening Xcode

```sh
cd ios/SSMCompanion
swift build                                                          # quick host-platform sanity check
xcodebuild -scheme SSMCompanion -destination 'generic/platform=iOS Simulator' build   # real iOS build
```

Both were run against this exact code and succeeded (`** BUILD SUCCEEDED **`
for the iOS Simulator build, arm64 + x86_64).

## Configuring the API base URL

`APIClient.shared.baseURL` defaults to `https://speedskatemeet.com`. To point
at a local dev server instead, set it once at app startup, e.g. in your host
app's `init()`:

```swift
import SSMCompanion

init() {
    #if DEBUG
    APIClient.shared.baseURL = URL(string: "http://127.0.0.1:10000")!
    #endif
}
```

There's no separate `.env`/config file for the iOS app — it's one property,
intentionally, since this is a small companion app, not a multi-environment
enterprise client.

## Backend: new endpoints added

All in `routes/mobileApiRoutes.js`, mounted in `server.js`. These are
**additive** — nothing existing was changed or removed, and the existing
website pages still render exactly as before (verified: all 62 existing
backend tests pass after this change).

| Endpoint | Purpose | Reuses |
|---|---|---|
| `GET /api/v1/me` | Current session's user + roles | `getSessionUser` |
| `GET /api/v1/meets` | Public meet list + search (`q`, `city`, `state`, `league`, `date`) | `isPublicMeet`, `meetRinkLabel` |
| `GET /api/v1/meets/:id` | Meet detail | `currentRaceInfo`, `meetDateLabel` |
| `GET /api/v1/meets/:id/live` | Current/next/coming/recent results — powers both Live Race Day and Live Board | `currentRaceInfo`, `laneRowsForRace`, `recentClosedRaces` |
| `GET /api/v1/meets/:id/results` | Standard/quad/open results sections | `computeMeetStandings`, `computeQuadStandings`, `computeOpenResults` |
| `GET /api/v1/meets/:id/staff-access` | Resolves the logged-in user's role for this meet (director/tabulator/announcer/referee/none) | `canEditMeet`, `canJudgeMeet`, `isAssignedTabulatorForMeet`, staff assignments |
| `GET /api/v1/my-staff-meets` | Every meet the logged-in user has staff access to | same as above |
| `GET /api/v1/meets/:id/race-day-state` | Staff-only: full race-day state + race picker list | `currentRaceInfo`, `raceDayProgress` |

Staff race-day **controls** (set current race, step forward/back,
pause/resume, unlock) call the website's pre-existing endpoints directly —
no new mutation logic was written:

- `POST /api/meet/:meetId/race-day/set-current`
- `POST /api/meet/:meetId/race-day/step`
- `POST /api/meet/:meetId/race-day/toggle-pause`
- `POST /api/meet/:meetId/race-day/unlock-race`

These already required `meet_director`-equivalent access (which, per the
permission work done earlier in this codebase, tabulators get on meets they
own or are assigned to) — the iOS app doesn't loosen or change that.

## Known v1 scope cuts

Being upfront about what's *not* built yet, rather than silently dropping it:

- **Correction Mode** is not implemented in the app. The spec listed it as
  conditional ("if supported"); it would need a new endpoint to expose the
  website's `/portal/meet/:meetId/race-day/correction` flow as JSON.
- **Tabulator result entry** (posting place/time/status for the current
  race — the website's Judges/save screen) is not in this app. The Staff
  tab's controls cover race-day *flow* (advance/pause/unlock), not entering
  results. This is the most likely next feature to add.
- **Re-Randomize Lanes** is not exposed in the app.
- Auto-update / push notifications are not implemented — Live screens poll
  every 8 seconds while visible, matching the website's own refresh cadence.

## Brand

Colors in `Theme/SSMTheme.swift` are pulled directly from the website's CSS
custom properties (`utils/pageShell.js`) — navy `#13213a`, orange `#F97316`,
sky `#38BDF8` — so the app should feel like the same product as the site and
desktop app, not a different one wearing the same name.
