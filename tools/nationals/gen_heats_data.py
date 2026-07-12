import sys, os, re, json, glob
sys.path.insert(0, os.path.dirname(__file__))
from parse_heats import parse_sheet
from relay_parse import parse_relay_sheet

ROOT = "/Users/leebird/Documents/GitHub/IDN 2026"
SCHED_JS = "/Users/leebird/Documents/GitHub/speedskate-meet/data/nationals2026.js"
OUT = "/Users/leebird/Documents/GitHub/speedskate-meet/data/nationals_heats.js"

def load_schedule():
    txt = open(SCHED_JS).read()
    txt = txt[txt.index("module.exports = ") + len("module.exports = "):]
    txt = txt.rstrip().rstrip(";")
    return json.loads(txt)

def meters(d):
    m = re.search(r'(\d+)', str(d) or "")
    return m.group(1) if m else ""

def phase_of_format(fmt):
    f = (fmt or "").lower()
    if "semifinal" in f or "semi" in f: return "semis"
    if "final" in f and "semi" not in f: return "final"
    return "heats"

def round_phase(label):
    l = label.lower()
    if l.startswith("heat"): return "heats"
    if l.startswith("semi"): return "semis"
    if l.startswith("final") or l == "final": return "final"
    return "heats"

def round_label(rnd):
    r = rnd["round"]
    if r == "final": return "Final"
    if r == "semi": return f"Semifinal {rnd['number']}".strip()
    if r == "heat": return f"Heat {rnd['number']}".strip()
    return r.capitalize()

def build_lut_for(disc, top):
    # key: discipline|division_lower|meters -> {heats:[rounds], semis:[rounds], final:[rounds]}
    lut = {}
    base = os.path.join(ROOT, top)
    if not os.path.isdir(base):
        return lut
    for pdf in glob.glob(os.path.join(base, "**", "*.pdf"), recursive=True):
        low = pdf.lower()
        if "relay" in low or "overall" in low: continue  # overall = points table, handled separately
        p = parse_sheet(pdf)
        if not p["division"] or not p["rounds"]: continue
        key = f"{disc}|{p['division'].lower().strip()}|{meters(p['distance'])}"
        bucket = lut.setdefault(key, {"heats": [], "semis": [], "final": []})
        for rnd in p["rounds"]:
            lab = round_label(rnd)
            has_results = any(s.get("place") for s in rnd["skaters"])
            bucket[round_phase(lab)].append({
                "label": lab, "toQualify": rnd["toQualify"],
                "results": has_results,
                "skaters": [{"helmet": s["helmet"], "name": s["name"], "team": s["team"],
                             "scratched": s["status"] == "SC",
                             "place": s.get("place", ""), "time": s.get("time", "")}
                            for s in rnd["skaters"]],
            })
    for b in lut.values():
        # A "Placements" sheet re-lists the final with finishing places/times;
        # when present it supersedes the pre-race final lineup for that event.
        if any(r.get("results") for r in b["final"]):
            b["final"] = [r for r in b["final"] if r.get("results")]
        for k in b:
            b[k].sort(key=lambda r: r["label"])
    return lut

def build_relay_lut():
    # Relays live under "00 Relays". The PDF header division ("Senior 2 Men",
    # "Masters 2 Ladies", …) + meters matches the schedule's relay events, so we
    # key them the same way. Each TEAM becomes one row: club+color as the name,
    # member names as the detail (the "team" field the UI shows muted).
    lut = {}
    root = os.path.join(ROOT, "00 Relays")
    if not os.path.isdir(root):
        return lut
    for pdf in glob.glob(os.path.join(root, "**", "*.pdf"), recursive=True):
        p = parse_relay_sheet(pdf)
        if not p["division"] or not p["rounds"]:
            continue
        key = f"inline|{p['division'].lower().strip()}|{p['meters']}"
        bucket = lut.setdefault(key, {"heats": [], "semis": [], "final": []})
        for rnd in p["rounds"]:
            lab = round_label(rnd)
            has_results = any(t.get("place") for t in rnd["teams"])
            bucket[round_phase(lab)].append({
                "label": lab, "toQualify": rnd["toQualify"],
                "results": has_results, "relay": True,
                "skaters": [{"helmet": t["helmet"], "name": t["club"],
                             "team": ", ".join(t["members"]), "scratched": False,
                             "place": t.get("place", ""), "time": t.get("time", "")}
                            for t in rnd["teams"]],
            })
    for b in lut.values():
        if any(r.get("results") for r in b["final"]):
            b["final"] = [r for r in b["final"] if r.get("results")]
        # Some relay groups only have Heats posted (finals not run yet). So they
        # still appear in the Finals view, synthesize a lineup from the heat/semi
        # teams (deduped by helmet) when there's no final sheet.
        if not b["final"]:
            src = b["semis"] or b["heats"]
            if src:
                teams, seen = [], set()
                for rd in src:
                    for t in rd["skaters"]:
                        if t["helmet"] not in seen:
                            seen.add(t["helmet"])
                            teams.append(t)
                b["final"] = [{"label": "Final", "toQualify": "", "results": False,
                               "relay": True, "skaters": teams}]
        # Relays: only surface the (real or synthesized) final; heats/semis would
        # just duplicate the same teams under other schedule sessions.
        b["heats"], b["semis"] = [], []
        b["final"].sort(key=lambda r: r["label"])
    return lut


def build_lineups():
    # Inline precedence (oldest -> newest): Inlines (base) < Inlines2 < Inlines3 < Inlines4.
    # Each newer batch wins per (division, distance, phase) where it has data,
    # so the latest final RESULTS override the earlier pre-race lineups. Quad from Quads.
    inline = build_lut_for("inline", "Inlines")
    for top in ("Inlines2", "Inlines3", "Inlines4", "Inlines5", "Inlines6"):
        newer = build_lut_for("inline", top)
        for key, batch in newer.items():
            base = inline.setdefault(key, {"heats": [], "semis": [], "final": []})
            for phase, rounds in batch.items():
                if rounds:
                    base[phase] = rounds
    lut = {}
    lut.update(inline)
    lut.update(build_lut_for("quad", "Quads"))
    lut.update(build_relay_lut())  # relay keys ("senior 2 men") don't collide with individual
    return lut

# Divisions to drop entirely (e.g. a race that never ran — one entrant scratched
# and the other was run down in the adjacent age group). Lowercased division names.
HIDE_DIVISIONS = {"premier ladies"}

def build():
    sched = load_schedule()
    lut = build_lineups()
    matched = 0; unmatched = []

    days_out = []
    for day in sched["days"]:
        is_quad = "quad" in json.dumps(day).lower()
        disc = "quad" if is_quad else "inline"
        sessions = []
        cur = None
        for it in day["items"]:
            if it["t"] == "head":
                cur = {"label": it["text"], "events": []}
                sessions.append(cur)
            elif it["t"] == "event":
                if it["division"].lower().strip() in HIDE_DIVISIONS:
                    continue
                if cur is None:
                    cur = {"label": "", "events": []}
                    sessions.append(cur)
                fmt = (it.get("format") or "").strip()
                phase = phase_of_format(fmt)
                key = f"{disc}|{it['division'].lower().strip()}|{meters(it.get('distance'))}"
                bucket = lut.get(key) or {}
                if fmt:
                    # Explicit round: "2 Heats" / "Semifinal" / "Final".
                    rounds = bucket.get(phase, [])
                else:
                    # A format-less individual event is the FINAL slot — heats are
                    # always explicitly labeled "N Heats", so an unlabeled event is
                    # the final (or the best available round leading to it). This is
                    # what pairs with a sibling "N Heats" event for divisions that
                    # run heats+final, and is the lone event for straight-to-final ones.
                    rounds = bucket.get("final") or bucket.get("semis") or bucket.get("heats") or []
                if rounds: matched += 1
                else: unmatched.append(key + " [" + phase + "]")
                cur["events"].append({
                    "num": it.get("num", ""), "division": it["division"],
                    "distance": it.get("distance", ""), "format": it.get("format", ""),
                    "qualify": it.get("qualify", ""), "rounds": rounds,
                })
        sessions = [s for s in sessions if s["events"]]
        if sessions:
            days_out.append({"date": day["date"], "sessions": sessions})

    out = {
        "title": "2026 Indoor Nationals — Heat Sheets",
        "subtitle": "Lincoln, NE · July 7–15, 2026",
        "tentative": True,
        "days": days_out,
    }
    js = "// AUTO-GENERATED (schedule-ordered heat sheets) — do not hand-edit.\n"
    js += "module.exports = " + json.dumps(out, indent=1, ensure_ascii=False) + ";\n"
    open(OUT, "w").write(js)

    total = matched + len(unmatched)
    print(f"wrote {OUT}")
    print(f"  days: {len(days_out)}  events: {total}  with-lineup: {matched}  no-lineup: {len(unmatched)}")
    from collections import Counter
    print("  sample no-lineup keys:", list(Counter(unmatched).keys())[:8])

if __name__ == "__main__":
    build()
