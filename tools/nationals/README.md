# Nationals data generators

These scripts turn the USARS heat-sheet / results PDFs into the data files the
site reads. They are **build tooling** — run them locally, then commit the
generated `data/*.js` files. The site never runs these at request time.

## What they produce

| Script | Reads | Writes |
|--------|-------|--------|
| `gen_heats_data.py` | `IDN 2026/Inlines*`, `Quads`, `00 Relays` | `data/nationals_heats.js` (Finals view) |
| `gen_champions.py`  | `IDN 2026/Inlines*/**/*Overall*.pdf` | `data/nationals_champions.js` (Champions tab) |

Parsers: `parse_heats.py` (individual sheets), `relay_parse.py` (relay teams +
members), `parse_overall.py` (overall points standings).

## Source folder layout (`~/Documents/GitHub/IDN 2026/`, NOT in this repo)

- `Inlines`, `Inlines2`, `Inlines3`, … — successive re-exports. **Higher number
  wins** per (division, distance, phase), so the latest results override earlier
  lineups. Add a new `InlinesN` folder and bump the loop in both gen scripts
  (`for top in (... "InlinesN")`).
- Each division folder has `01 Long`, `02 Short`, `03 Middle` with
  `… Heats.pdf`, `… SemiFinals.pdf`, `… Finals.pdf`, `… Placements.pdf`
  (Placements = final results with places + times).
- `00 Relays/{2,3,4} person/<Division> Relays/…` — relay sheets.
- `<Division> Overall.pdf` — overall points standings (Champions tab).

## Regenerate after a new folder drops

```sh
# from a venv with pdfplumber installed
python tools/nationals/gen_heats_data.py
python tools/nationals/gen_champions.py
git add data/nationals_heats.js data/nationals_champions.js && git commit && git push
```

Paths to `IDN 2026` and the output files are hardcoded near the top of each
gen script — adjust if the repo/source lives elsewhere.

## Non-obvious gotchas (hard-won)

- **A format-less schedule event is the FINAL slot.** Heats are always labelled
  "N Heats"; an unlabelled individual event is the final. Resolving it to heats
  drops every younger division's Short/Middle final.
- **`^final` not `final`** when detecting final rounds — "Semifinal" contains the
  substring "final".
- **Relays with only Heats posted**: synthesize a lineup from the heat teams so
  the group still shows before its final runs.
- **Overall sheets render the points column on top of the name/team** (overlapping
  text), so extracted names are garbled. `gen_champions.py` recovers clean names
  by joining each standings row to the race-sheet names **by helmet number**.
- The Finals view / schedule show/hide specific dates via `RESULTS_SHOW_DATES`
  and `SCHEDULE_HIDE_DATES` in `server.js` — update those as days finish.
