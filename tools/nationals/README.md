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

## Source folder layout (`~/Documents/GitHub/IDN 2026*/`, NOT in this repo)

Both gen scripts read a **`ROOTS`** list of source drops, **oldest → newest**
(currently `IDN 2026`, then `IDN 2026 #2`). A later drop overrides an earlier one
per (division, distance, phase), but a sheet that exists **only** in an earlier
drop is kept — so a re-export that silently omits a few heats can't lose them.

- `Inlines`, `Inlines2`, `Inlines3`, … — successive re-exports *within* a drop.
  **Higher number wins**, same rule. Add a new `InlinesN` folder and bump the loop
  in both gen scripts (`for top in (... "InlinesN")`).
- Each division folder has `01 Long`, `02 Short`, `03 Middle` with
  `… Heats.pdf`, `… SemiFinals.pdf`, `… Finals.pdf`, `… Placements.pdf`
  (Placements = final results with places + times).
- `00 Relays/{2,3,4} person/<Division> Relays/…` — relay sheets.
- `<Division> Overall.pdf` — overall points standings (Champions tab).

## Regenerate after a new folder drops

Add the new drop to the end of **`ROOTS` in both gen scripts**, then:

```sh
# from a venv with pdfplumber installed (tools/nationals/.venv)
python tools/nationals/gen_heats_data.py
python tools/nationals/gen_champions.py
git add data/nationals_heats.js data/nationals_champions.js && git commit && git push
```

`ROOTS` and the output paths are near the top of each gen script — adjust if the
repo/source lives elsewhere. A full run parses ~1,000 PDFs and takes a few
minutes per script; run them in the background, not a 2-minute foreground call.

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
- **Quad relays live in `Quads/00 Relays`** and were silently never parsed:
  `build_lut_for()` skips any path containing "relay", and the relay loop only
  walked `Inlines*`. They also must be keyed to the **`quad`** discipline, since
  `build()` looks up `quad|<division>|<meters>` on quad days — a hardcoded
  `inline|` prefix means they can never match.
- **Quad champions**: quad divisions reuse the inline division names
  ("Freshman", "Senior", …), so `gen_champions.py` reads `Quads` *and* prefixes
  those divisions `Quad ` — without the prefix they overwrite inline standings.
- The Finals view / schedule show/hide specific dates via `RESULTS_SHOW_DATES`
  and `SCHEDULE_HIDE_DATES` in `server.js` — update those as days finish.
