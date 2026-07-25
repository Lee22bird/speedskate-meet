# SpeedSkateMeet (SSM) — Knowledge Base

A living reference for how SpeedSkateMeet works: the domain, the architecture, the
scoring/advancement engine, the relay system, the testing approach, deployment,
and — importantly — the class of bug that bit us twice. Written for whoever picks
this up next (human or AI), so they don't have to rediscover it.

---

## 1. What SSM is

A free web app for running USARS roller speed-skating meets end to end — from
registration through race-day tabulation to championship results. Node.js/Express
monolith, server-rendered HTML, JSON datastore. Plus an Electron desktop wrapper
and iOS/Android companions. Kept **free forever** for even the smallest leagues
(the owner is never selling it). Must run **any** USARS meet — a tiny league night
or full Indoor Nationals.

Season starts **October 4**. Real meets are tabulated by a human (e.g. "Jessica")
who currently runs race day on Google Sheets.

---

## 2. Architecture / key files

- **`server.js`** (~170KB) — the Express app, route wiring, `loadDb()`/`saveDb()`,
  the coach relay routes, and lots of glue. `DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname`.
- **`services/`** — the real logic:
  - `standings.js` — `computeMeetStandings` (inline overalls), `computeQuadStandings`
    (quad overalls, bucketed by groupId alone).
  - `usarsScoring.js` — SR832 tiebreaker weights, Novice helpers, distance parsing.
  - `meetHelpers.js` — a grab bag: `migrateMeet` (⚠ see §10), `defaultMeet`,
    `nextId`, race/relay advancement (`advanceRaceProgression`, `advanceSemisFromHeats`,
    `advanceFinalFromSemis`, `semiSeedingPlan`), results-rendering helpers
    (`resultsSectionHtml`, `raceAuditTableHtml`), `coachTeamRegistrations`.
  - `relayGenerator.js` — `buildRelayRacesFromTeams`, `advanceRelayProgression`
    (relay bracket engine: heats→semis→final, place-based for 2p/4p).
  - `relayHelpers.js` — `makeRelayRace`, relay templates, `relayOptionKeyForRace`,
    `relayEligibleRegistrationsForRace`.
  - `relayDivisions.js` — `RELAY_DIVISIONS` (inline), `QUAD_RELAY_DIVISIONS`,
    `ALL_RELAY_DIVISIONS`, `RELAY_DIVISION_BY_ID`, `eligibleForRelayDivision`.
  - `nationalsRoster.js` — `buildNationalsDevRoster` (real 2026 Nationals field for
    dev/testing, reads `data/nationalsRoster.js`).
  - `importAdapters/nationalsAdapter.js` — `nationalsToIR` (real Nationals bracket → IR).
  - `meetImport.js` — `buildMeetFromIR` (IR → a fully-populated meet object).
- **`routes/`** — `registrationRoutes.js` (registration + dev imports + the golden
  master route), `raceDayRoutes.js` (tabulator/judges, `laneResultFromBody`,
  set-current), `builderRoutes.js` (meet/relay/open builders, `/division-scheme`),
  `adminRoutes.js` (archive/clone/delete meets).
- **`views/`** — server-rendered HTML modules (`relayBuilderView.js`, `coachRelaysView.js`, …).
- **`data/`** — `nationalsRoster.js` (dev roster source), `nationals_heats.js`
  (real bracket w/ finishes), `nationals_champions.js` (the **answer key**),
  `nationals_meet.json`.
- **`tools/nationals/`** — `reconcile_nationals.js` (the **golden master**), answer-key generators.
- **`test/`** — `node:test` suite (currently **107 tests**).

---

## 3. Data model

- **Meet**: `{ id, meetName, status ('draft'|'published'|'complete'), isPublic,
  usarsDivisions, tiebreaker ('sr832'|'d2'), groups, quadGroups, races[],
  registrations[], relayTeams[], relayTemplates[], blocks[], currentRaceId, ... }`.
  Created via `defaultMeet(user)`; `nextId(db.meets)` assigns ids.
- **Registration**: `{ id, name, age, gender, team, helmetNumber, options{…}, paid,
  checkedIn, importSource, ... }`. `options` is a **boolean map**: `elite, novice,
  open, quad, relay2Person/3Person/4Person, quadRelay2Person/quadRelay3Person,
  additional, timeTrials, ...`.
- **Race**: `{ id, groupId, groupLabel, division, distanceLabel, stage
  ('heat'|'semi'|'final'), heatNumber, isFinal, isRelayRace, isQuadRace,
  isOpenRace, relayDivisionId, relayType, relayAgeGroup, relayAgeRange,
  parentRaceKey, laneEntries[], status ('open'|'closed'), resultsMode
  ('places'|'times'), countsForOverall, ... }`.
- **LaneEntry**: `{ lane, registrationId, helmetNumber, skaterName, team, place,
  time, status, record?, relayTeamId?, relayMemberRegIds?, ... }`.
- **Persistence**: `loadDb()`/`saveDb()` over `ssm_db.json` via `writeJsonAtomic`
  (temp + rename). `loadDb()` runs `migrateMeet` on every meet on every load (⚠ §10).

---

## 4. USARS scoring rules (the domain contract)

- **Points**: finals-only scoring, **30 / 20 / 10 / 5** to the top 4. Heats/semis
  are **qualifying — no points awarded**.
- **Overall champion**: sum of a skater's per-distance points across their division's
  distances. **Elite = 3 distances**; **Novice = 2 distances** (longest distance is
  the tiebreaker). Per-distance championships exist at **Nationals only**.
- **Tiebreaker**: USARS **SR832** — weighted points by finishing position across
  races in **race order** (not shortest-to-longest). Weights (place → [short,mid,long]):
  `1:[96,108,120.75], 2:[64,72,80.5], 3:[32,36,40.25], 4:[16,18,20.125]`.
  Verified against real totals (e.g. Masters Men #206 all-4ths = 16+18+20.125 = 54.125).
  Default non-USARS tiebreaker is `d2`; USARS meets must use `sr832`.
- **Age**: USARS age **as of Jan 1**, frozen for the competition year.
- **Disciplines**: **inline** and **quad** are scored as **separate overalls**
  (a skater can win both). Quad standings bucket by `groupId` alone.
- **Relays**: **placement-only, zero overall points** (never affect the overall).
  Quad relays are also placement-only.

---

## 5. Advancement (heats → semis → finals)

Lives in `advanceRaceProgression(meet, changedRace)` (meetHelpers.js), called on
race **close** from the judges/save handler.

- **1–2 heats** → straight to the final. 2-heat MVP: top 3 from each heat → 6-skater final.
- **3–4 heats** → **2 semis → final** per **SR505.4**. Semis are **created lazily**
  on the last heat close (not at generation time). Seeding plan
  (`semiSeedingPlan(heatCount)`):
  - **4 heats**: Semi 1 = heats **1 & 4** top 3; Semi 2 = heats **2 & 3** top 3.
  - **3 heats**: Semi 1 = h1(1–4)+h2(2,3); Semi 2 = h2(1,4)+h3(1–4).
  - Each semi's top 3 → the 6-skater final.
- **5+ heats** (quarterfinals) → stays **manual** (not built).
- **Automatic by field size** — there is **no per-meet toggle**. Bracket depth
  follows the number of heats, league or nationals. (Historically gated behind
  `usarsDivisions`/`autoSemis`; that gate was removed — see git history.)
- Advancement selects by **finishing place, not lane**.

Relay advancement is the parallel engine in `relayGenerator.js`
(`advanceRelayProgression` → `relayTwoHeatsToFinal` / `relayHeatsToSemis` /
`relaySemisToFinal`), keyed by `relayDivisionId`, preserving team identity.

---

## 6. Relays (inline + quad)

- **Divisions**: `RELAY_DIVISIONS` (49 inline), `QUAD_RELAY_DIVISIONS` (26, ids
  `q2_*`/`q3_*`). `ALL_RELAY_DIVISIONS` = both. Each has `discipline: 'inline'|'quad'`,
  `size` (2/3/4), `ageRange`, `gender`, `distance`. `RELAY_DIVISION_BY_ID` covers all.
- **Registration**: relay options are `relay2Person/3Person/4Person` (inline) and
  `quadRelay2Person/quadRelay3Person` (quad). Eligibility for a quad relay division
  **requires the matching quad option** (`eligibleForRelayDivision` enforces it);
  inline is age/gender only.
- **Team building**: coaches submit teams via `POST /portal/meet/:id/coach/relays`
  with `t_<divisionId>_<teamIndex>_<slot>=<regId>` fields. Teams are **per-club**;
  a director/super-admin can pick a club via `?team=`. Complete teams (size match)
  are kept in `meet.relayTeams`.
- **Generation**: `buildRelayRacesFromTeams(meet)` iterates **ALL_RELAY_DIVISIONS**,
  tags quad races `isQuadRace`. ≤7 teams → single final; >7 → heats (+ lazy semis)
  → final. 2p/4p qualify by **place** (SR505.3/.4); **3-person by time (SR505.9)**.
- **Race day**: relay races are placement-only, manual team fill-in; the tabulator
  shows eligible/assigned teams and a `🛼 Quad` marker for quad.
- **3-person relays (SR505.9 times system) — BUILT & VERIFIED.** 8+ team 3-person
  divisions use `advanceThreePersonRelay` + `planThreePersonRelaySizing`: **win-and-in
  + fastest times** (each heat/semi winner advances directly; remaining slots go to
  the fastest times). Heats/semis record `resultsMode:'times'`. 8–21 teams → heats →
  6-team final; 22+ → heats → 2 semis → final. Verified headless AND live (24 teams →
  4 heats → 2 semis → final, champion crowned). It was written but never run — it
  only started working after the `relayDivisionId` migrate fix (§10).

---

## 7. Records (🏅 New Record)

- A per-lane **🏅 Rec checkbox** at results entry (judges panel + correction editor),
  persisted on the lane entry as `record: true` via `laneResultFromBody`. Checkbox
  semantics handled carefully (a checkbox only POSTs when checked; a rendered lane
  is detected by its text inputs so "unchecked" ≠ "not submitted").
- A **🏅 New Record badge** renders next to the skater in the per-race results table
  (`raceAuditTableHtml`), joined by `registrationId`.
- Records are captured, not scored — celebratory only.

---

## 8. The golden master (how we know scoring is correct)

`tools/nationals/reconcile_nationals.js`:
- Imports the **real 2026 Indoor Nationals** bracket (`data/nationals_heats.js`)
  via `nationalsToIR` → `buildMeetFromIR`.
- Scores it with **SSM's own** `computeMeetStandings`/`computeQuadStandings` — never
  a re-implementation.
- Reconciles against the **official answer key** (`data/nationals_champions.js`,
  parsed from the official PDFs; **no SSM logic touches it** — non-circular).
- Result: **reproduces 50/50 champions, 200/220 ranks**, 1 division intentionally
  unscored (Premier Ladies — a single-skater field).

There's also a **browser-drivable** twin: `POST /dev/load-nationals-scored` builds
the same scored meet as a live meet so you can watch SSM crown the champions on the
Results page. Run it, then open Results.

**Testing philosophy (the owner's rule): investigate, don't mask.** A green test
that hides a bug is worse than a known-red one. Two clock-fragile tests were fixed
by passing an explicit `at` timestamp, **not** by loosening assertions.

---

## 9. Deployment & infrastructure

- **Render** (`speedskate-meet` web service, Starter plan). Auto-deploys on push to
  `main`. Live domain: **speedskatemeet.com**. Deploys take ~35–55s.
- **Persistence**: a **1 GB persistent disk mounted at `/data`** (with daily
  snapshots). The app uses `/data` when present, else ephemeral `__dirname`. Without
  the disk, all data is wiped on each redeploy.
- **Git lives OUTSIDE iCloud.** The repo was moved from `~/Documents/GitHub/…`
  (iCloud-synced, which races with git's lock files and caused endless
  `HEAD.lock`/`index.lock`/"unable to unlink" errors) to **`~/dev/speedskate-meet`**.
  Keep git repos out of iCloud/Dropbox.
- **Commits** happen locally; **pushes** are done from Terminal:
  ```
  cd ~/dev/speedskate-meet && rm -f .git/HEAD.lock .git/index.lock && git push
  ```
  A one-time `git config --global user.email/user.name` was needed (the machine had
  no git identity, which silently blocked every commit).

---

## 10. ⚠ The bug class that bit us twice: `migrateMeet`'s whitelists

`migrateMeet(meet)` runs on **every `loadDb()`** and **rebuilds meets, registrations,
and races from fixed field whitelists**. Any field not in a whitelist is **silently
dropped on the next load** — even if the code that set it is perfectly correct.
This is the single most dangerous pattern in the codebase.

Two real production bugs, both invisible to headless tests (which don't round-trip
through load), both found only by a **live end-to-end run**:

1. **Registration options** — the reg-options whitelist omitted `quadRelay2Person`/
   `quadRelay3Person`, so quad-relay registrations vanished the instant the meet
   reloaded. Nobody could register for quad relays.
2. **Relay identity** — the race whitelist omitted `relayDivisionId` (and
   `relayType`/`relayAgeGroup`/`relayAgeRange`), so relay races lost their family key
   on load and `advanceRelayProgression` bailed ("not relay"). **Every relay bracket
   — inline AND quad, 8+ teams — failed to advance to its final.** Single-final
   relays still worked, which hid it.

**Rule of thumb: whenever you add a new field to a meet/registration/race/laneEntry,
grep `migrateMeet` and add it to the relevant whitelist, or it will be erased on the
next load.** And always do at least one live round-trip test, not just headless.

---

## 11. Gotchas & conventions

- **Run tests with** `node --test test/*.test.js` (node 22 treats a bare `test/`
  dir as a module). Don't boot the server in a test (`require('./server.js')` hangs
  because it listens).
- **Concurrency**: there is only ever **one tabulator** entering scores. The server
  is last-write-wins; don't drive concurrent writes.
- **Relay teams are per-club**; the coach form/POST is scoped to one club at a time.
- **Set the current race** via `POST /api/meet/:id/race-day/set-current {raceId}`;
  the judges page always shows the current race. Closing a race auto-advances the
  current pointer to the next in order.
- **Close a race** (with advancement) via `POST /portal/meet/:id/race-day/judges/save`
  with `raceId`, `action=close`, `resultsMode=places`, and `place_<lane>` fields.
  Add `ajax=1` + `Accept: application/json` to get a JSON response.
- **Dev-roster team names** carry a cosmetic pollution artifact for record-setters
  (e.g. `"Astro Speed 1:05.361 -New Record"`) — the PDF parser overlapped the team
  column with the record time. Cleaned in the golden-master adapter path
  (`nationalsAdapter`) via clean-team backfill; the dev-roster path
  (`data/nationalsRoster.js`) still has it. Cosmetic only; real meets use clean
  registration data.
- **Public "Live" view**: a meet appears on `/live` (and `/meet/:id/live`,
  `/meet/:id/results`) when `isPublic && status==='published' && !archivedAt`.
  Publishing is done via the Meet Builder status control (`/builder/save`), which
  sets `isPublic = status==='published'`. `usarsDivisions` is set by the Meet Builder
  USARS toggle (`/division-scheme`), NOT by the dev `setup-usars` shortcut originally
  (that was fixed to set it too).

---

## 12. Dev tools (super-admin dev routes)

On the Registered → **Dev Import** page (`/portal/meet/:id/dev/import-spring-fling`):
- **Set Up Full USARS Meet** (`/dev/setup-usars`) — enables all age + quad divisions,
  relays, SR832, and sets `usarsDivisions`.
- **Import rosters**: Spring Fling, 115-skater training, **2026 Nationals** (roster
  only, no results — `importNationalsRoster` via `buildNationalsDevRoster`).
- **Load Scored 2026 Nationals → New Meet** (`/dev/load-nationals-scored`) — the
  browser-drivable golden master (creates a separate, fully-scored meet).

---

## 13. Current status

**Done, deployed, verified:**
- Scoring (golden master 50/50), Novice scoring, per-distance vs overall.
- Advancement: 2-heat and full heats→semis→final, **automatic by field size**.
- Ran an **entire national schedule** headlessly-driven: 327 races (159 heats, 60
  semis, 108 finals), 0 errors, 29 champions.
- 🏅 Records feature (capture + badge).
- **Quad relay engine end to end**: registration → per-club team building →
  bracket generation → heats→final advancement → champion. Proven live.
- **3-person relay times system (SR505.9)**: win-and-in + fastest times, heats →
  2 semis → final. Proven live (24 teams).
- Persistence (mounted disk), public Live view, repo out of iCloud, 107/107 tests.

**Known remaining gaps:**
- **5+ heat individual divisions** (quarterfinals) stay manual by design.
- **Google Sheets importer** for Jessica's race-day sheet — not built (needs a
  sample sheet). This is the biggest real-world unblock left.
- **A real human dry-run on real race day** — everything so far is automated driving.
- Dev-roster cosmetic team-name pollution (see §11).

**Reflection:** the headless tests were all green while two real bugs silently ate
data in production. The live end-to-end runs — not the unit tests — are what caught
them. Prefer proving features with a real round-trip through save/load.
