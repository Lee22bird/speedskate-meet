# SSM Companion (iOS)

A focused iOS companion app for SpeedSkateMeet — **not** the full meet
management system. It covers exactly five things:

1. Find a Meet
2. Live Race Day (public)
3. Live Board (simplified, glance-friendly view — toggle inside Live Race Day)
4. Results
5. Logged-in Race Day Staff controls, gated by the user's assigned role

It does **not** include Meet Builder, Open/Quad/Relay/Block Builder, Submit a
Meet/Rink, Rinks, About, Help, the admin portal, or any desktop-only tools.
None of that exists in this app, by design.

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
