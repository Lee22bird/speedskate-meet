import re
import pdfplumber

# Relay sheets differ from individual sheets: the header is
# "<Division> <size> <gender> <meters> Meters Relay" (e.g. "Masters 2 Ladies
# 2000 Meters Relay"), and each entry is a TEAM line — "#<helmet> <club> <color>"
# (optionally a leading finishing place, optional trailing time) — followed by
# that team's member names on their own lines (no "#").

def parse_relay_sheet(path):
    with pdfplumber.open(path) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    lines = [l.rstrip() for l in text.splitlines() if l.strip()]

    # Header: division = everything before the "<meters> Meters Relay" tail.
    division, meters = "", ""
    hdr_re = re.compile(r'^(.+?)\s+(\d+)\s*Meters\s*Relay', re.I)
    for l in lines[:6]:
        h = hdr_re.match(l)
        if h:
            division = h.group(1).strip()
            meters = h.group(2)
            break

    sec_re = re.compile(r'^(Heat|Semifinal|Semi|Quarterfinal|Quarter|Final)s?\s*#?(\d*)\s*(?:(\d+)\s*To Qualify)?', re.I)
    # Team line: optional place, "#helmet", then club+color (+ optional time).
    team_re = re.compile(r'^(?:(\d+)\s+)?#(\d+)\s+(.+)$')
    # Time can appear ANYWHERE in the club line — placements put it between the
    # club and the color ("Team New England/Ohana 2:32.160 Red") — so search
    # (not anchor) and splice it out.
    time_re = re.compile(r'(\d{1,2}:\d{2}\.\d{1,3}|\d{1,2}\.\d{2,3})')

    rounds = []
    cur = None       # current round
    team = None       # current team within the round

    for l in lines[1:]:
        if l.startswith("Page ") or l.lower().startswith("pl skater") or re.match(r'^\d{2}/\d{2}/\d{4}', l):
            continue
        s = sec_re.match(l)
        if s and not team_re.match(l):
            kind = s.group(1).lower()
            cur = {"round": kind, "number": s.group(2) or "", "toQualify": s.group(3) or "", "teams": []}
            rounds.append(cur)
            team = None
            continue
        m = team_re.match(l)
        if m:
            place, helmet, rest = m.groups()
            time = ""
            tm = time_re.search(rest)
            if tm:
                time = tm.group(1)
                rest = (rest[:tm.start()] + " " + rest[tm.end():])
            rest = re.sub(r'\s{2,}', ' ', rest).strip()
            if cur is None:
                cur = {"round": "final", "number": "", "toQualify": "", "teams": []}
                rounds.append(cur)
            team = {"helmet": helmet, "club": rest.strip(), "members": [],
                    "place": place or "", "time": time}
            cur["teams"].append(team)
        elif team is not None:
            # a member name line for the current team
            team["members"].append(l.strip())

    # Relay sheets often repeat the same roster across pages; collapse rounds
    # that have the same kind/number and identical team helmets.
    seen, uniq = set(), []
    for rd in rounds:
        sig = (rd["round"], rd["number"], tuple(t["helmet"] for t in rd["teams"]))
        if sig in seen or not rd["teams"]:
            continue
        seen.add(sig)
        uniq.append(rd)
    return {"division": division, "meters": meters, "rounds": uniq}


if __name__ == "__main__":
    import sys
    for p in sys.argv[1:]:
        r = parse_relay_sheet(p)
        print(f"\n=== {p.split('/')[-1]} ===")
        print(f"division={r['division']!r} meters={r['meters']!r} rounds={len(r['rounds'])}")
        for rd in r["rounds"]:
            print(f"  {rd['round']} #{rd['number']} ({rd['toQualify']} to qual) — {len(rd['teams'])} teams")
            for t in rd["teams"][:3]:
                pl = f"[{t['place']}] " if t['place'] else ""
                print(f"     {pl}#{t['helmet']} {t['club']}  :: {', '.join(t['members'])}  {t['time']}")
