# SpeedSkateMeet (SSM)

Meet-operations system: **website + Electron desktop app + SSM iOS companion**
(under `ios/`). Web and desktop must stay functionally aligned — core meet ops
are shared; desktop only adds local safety (backups, PIN, licensing, offline).
SSM owns meet operations; identity/community/history belong to SSL — don't mix.
See `../CLAUDE.md` for cross-project rules.

## Layout

- **All Express routes live in `server.js`** (~2500 lines). Helpers in
  `services/`, page renderers in `views/`. `data/*.js` are data modules.
- Data persists as JSON via `loadDb()`/`saveDb()` (`ssm_db.json`).
- Page HTML is built by `utils/pageShell.js` (navy/orange brand). Embedded app
  views use `nationalsEmbedShell()` etc. (bare shell, no site chrome).

## Deploy & verify

- **Render auto-deploys on push.** Always verify against the live site after a
  redeploy (`curl https://speedskatemeet.com/...`), not just locally.
- The local server may not boot in a sandbox — verify via the deployed site.

## Race / results model (important for any scoring work)

- A meet has `races[]` and `registrations[]`. Each race has `laneEntries[]`;
  each entry has `lane, helmetNumber, registrationId, skaterName, team, place`
  (string "1","2"…), `status` (DQ etc), `time`.
- **Scoring = setting `.place` (and `.status`) on entries, then `saveDb`.**
  Standings (`services/standings.js`, `usarsScoring.js`) and the results / TV
  views READ `laneEntries[].place` — don't invent a parallel results store.
- Relays are races too (`services/relayHelpers.js` `makeRelayRace`,
  `resultsMode:'places'`, `isRelayRace:true`); their `laneEntries` are teams.

## Nationals pages (heat sheets / champions)

- Routes: `/nationals` (schedule), `/nationals/heats` (Finals view),
  `/nationals/champions` (overall standings). Data: `data/nationals_*.js`.
- **That data is GENERATED** by `tools/nationals/` (read its README). Don't
  hand-edit `data/nationals_heats.js` / `nationals_champions.js`.
  - Generators need a Python venv with **`pdfplumber`**. It can silently vanish —
    if a regen doesn't change the day counts, suspect a missing `pdfplumber`
    (`ModuleNotFoundError`) and rebuild the venv. Don't commit stale data.
  - Which days show is manual: `RESULTS_SHOW_DATES` (Finals view) and
    `SCHEDULE_HIDE_DATES` (schedule) are edited in `server.js` as days finish.
