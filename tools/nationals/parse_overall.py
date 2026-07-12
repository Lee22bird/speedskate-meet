import re
import pdfplumber

# "Overall" sheets are per-division points standings. Layout per division:
#   <Division Name>
#   Pl Num Name Team Points Distance Place Points
#   <rank> #<num> <name/team> <pts> (<total>) <dist> Meters Race Final: <place> <pts> (<cum>)
#          <dist> Meters Race Final: <place> ...        <- continuation lines
#   <next rank> ...
#   <Next Division Name> ...
# One PDF can hold several divisions (e.g. Tiny Tot Boys + Tiny Tot Girls).

DIST_RE = re.compile(r'(\d+)\s*Meters\s+Race\s+Final:\s*(\d+|DQ|DNF|DNS|NP|NS)?', re.I)
RANK_RE = re.compile(r'^(\d+)\s+#(\d+)\s+(.+)$')
HEAD_RE = re.compile(r'^Pl\s+Num\s+Name', re.I)


def parse_overall(path):
    with pdfplumber.open(path) as pdf:
        raw = "\n".join(p.extract_text() or "" for p in pdf.pages)
    lines = [l.rstrip() for l in raw.splitlines() if l.strip()]

    divisions = []
    cur_div = None
    cur_sk = None

    for i, l in enumerate(lines):
        if HEAD_RE.match(l):
            # the line just above the column header is the division name
            name = lines[i - 1].strip() if i > 0 else ""
            cur_div = {"division": name, "skaters": []}
            divisions.append(cur_div)
            cur_sk = None
            continue
        if cur_div is None:
            continue
        m = RANK_RE.match(l)
        if m and DIST_RE.search(l):
            rank, num, rest = m.groups()
            # split the "name/team pts (total)" head from the first distance entry
            d = DIST_RE.search(rest)
            head = rest[:d.start()].strip()
            # total = last parenthetical number; strip the "<pts> (total)" tail
            # off the name/team (OCR sometimes glues them, e.g. "Speed50.0").
            tot = re.findall(r'\(([\d.]+)\)', head)
            total = tot[-1] if tot else ""
            name_team = re.sub(r'\([\d.]+\)\s*$', '', head)
            name_team = re.sub(r'\s*[\d.]+\s*$', '', name_team).strip()
            cur_sk = {"rank": rank, "num": num, "name": name_team, "total": total,
                      "places": [(mt, pl or "") for mt, pl in DIST_RE.findall(rest)]}
            cur_div["skaters"].append(cur_sk)
        elif cur_sk is not None and DIST_RE.match(l):
            cur_sk["places"].extend((mt, pl or "") for mt, pl in DIST_RE.findall(l))

    # drop empty divisions
    return [d for d in divisions if d["skaters"]]


if __name__ == "__main__":
    import sys
    for path in sys.argv[1:]:
        for dv in parse_overall(path):
            print(f"\n### {dv['division']}  ({len(dv['skaters'])} skaters)")
            for s in dv["skaters"]:
                pl = " ".join(f"{m}:{p}" for m, p in s["places"])
                print(f"  {s['rank']:>2}. #{s['num']:<4} {s['name'][:28]:<28} tot={s['total']:<9} [{pl}]")
