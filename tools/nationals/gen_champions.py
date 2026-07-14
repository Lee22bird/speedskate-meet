import os, re, json, glob
import sys
sys.path.insert(0, os.path.dirname(__file__))
from parse_overall import parse_overall
from parse_heats import parse_sheet

ROOT = "/Users/leebird/Documents/GitHub/IDN 2026"
OUT = "/Users/leebird/Documents/GitHub/speedskate-meet/data/nationals_champions.js"


def build_helmet_map(dirs):
    # The Overall sheets render the points column over the name/team (garbled
    # text), but each skater has a clean helmet number. The individual race
    # sheets DO have clean "Name - Team" per helmet, so join on helmet# to get
    # clean names. Later folders win (latest spelling).
    hmap = {}
    for base in dirs:
        for pdf in glob.glob(os.path.join(base, "**", "*.pdf"), recursive=True):
            low = pdf.lower()
            if "relay" in low or "overall" in low:
                continue
            try:
                p = parse_sheet(pdf)
            except Exception:
                continue
            for rnd in p["rounds"]:
                for s in rnd["skaters"]:
                    if s.get("helmet") and s.get("name"):
                        hmap[s["helmet"]] = {"name": s["name"].strip(), "team": s.get("team", "").strip()}
    return hmap


def clean_blob(s):
    # Fallback when a helmet isn't in the race sheets: strip interleaved points
    # digits and the orphaned decimal points they leave behind.
    s = re.sub(r'\d', '', s)
    s = re.sub(r'(?<=[A-Za-z])\.(?=[A-Za-z])', '', s)
    return re.sub(r'\s{2,}', ' ', s).strip(' .')

# Age order (youngest -> oldest) for sorting divisions.
AGE = ["tiny tot", "primary", "juvenile", "elementary", "freshman", "sophomore",
       "junior", "senior", "classic", "grand classic", "master", "grand master",
       "veteran", "grand veteran", "esquire", "grand esquire", "premier"]


def age_key(div):
    d = div.lower()
    idx = next((i for i, a in enumerate(AGE) if d.startswith(a)), len(AGE))
    # ladies/girls before men/boys
    g = 0 if ("ladies" in d or "girls" in d) else 1
    return (idx, g, d)


def build():
    # Inlines folders in order; later folders override a division's standings.
    dirs = sorted(glob.glob(os.path.join(ROOT, "Inlines*")),
                  key=lambda p: (len(p), p))  # Inlines < Inlines2 < ... < Inlines8 (auto-discovered)
    hmap = build_helmet_map(dirs)
    by_div = {}
    for base in dirs:
        for pdf in glob.glob(os.path.join(base, "**", "*.pdf"), recursive=True):
            if "overall" not in pdf.lower():
                continue
            for dv in parse_overall(pdf):
                if dv["division"] and dv["skaters"]:
                    by_div[dv["division"].strip()] = dv["skaters"]

    divisions = []
    for div in sorted(by_div, key=age_key):
        skaters = []
        for s in by_div[div]:
            clean = hmap.get(s["num"])  # join on helmet number
            name = clean["name"] if clean else clean_blob(s["name"])
            team = clean["team"] if clean else ""
            skaters.append({"rank": s["rank"], "num": s["num"], "name": name, "team": team,
                            "total": s["total"],
                            "places": [{"m": m, "place": p} for m, p in s["places"]]})
        divisions.append({"division": div, "skaters": skaters})

    out = {
        "title": "2026 Indoor Nationals — Division Champions",
        "subtitle": "Lincoln, NE · Overall standings by division",
        "divisions": divisions,
    }
    js = "// AUTO-GENERATED (overall division standings) — do not hand-edit.\n"
    js += "module.exports = " + json.dumps(out, indent=1, ensure_ascii=False) + ";\n"
    open(OUT, "w").write(js)
    print(f"wrote {OUT}")
    print(f"  divisions: {len(divisions)}  skaters: {sum(len(d['skaters']) for d in divisions)}")
    for d in divisions[:4]:
        champ = d["skaters"][0] if d["skaters"] else None
        print(f"    {d['division']}: champion = {champ['name'] if champ else '?'}")


if __name__ == "__main__":
    build()
