import sys, re, json
import pdfplumber

def parse_sheet(path):
    with pdfplumber.open(path) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    lines = [l.rstrip() for l in text.splitlines() if l.strip()]

    # Division/distance appear on a line like "Senior Men 3000 Meters"
    # (date/time is a separate line). Scan the first several lines for it.
    division, distance = "", ""
    # Division + distance, e.g. "Senior Men 3000 Meters" — may be followed by a
    # date/time on the same line (newer sheets), so don't anchor to end of line.
    hdr_re = re.compile(r'^(.+?)\s+(\d+)\s*Meters(\s*Relay)?(?:\s|$)')
    for l in lines[:6]:
        h = hdr_re.match(l)
        if h:
            division = h.group(1).strip()
            distance = f"{h.group(2)} Meters" + (" Relay" if h.group(3) else "")
            break

    heats = []
    cur = None
    # section header e.g. "Heat #1 4 To Qualify" / "Semifinal #1 3 To Qualify" / "Finals"
    sec_re = re.compile(r'^(Heat|Semifinal|Semi|Quarterfinal|Quarter|Final)s?\s*#?(\d*)\s*(?:(\d+)\s*To Qualify)?', re.I)
    # skater row.  Start-list form:  "#170 Brad Rex - California Speed"
    # Results form (Placements sheets): "1 #1 Miles Mead - Astro Speed 4:50.924"
    #   - optional leading finishing PLACE, optional status (SC/DQ/...),
    #   - #helmet, then "Name - Team", then an optional trailing TIME.
    # Team is the LAST " - " segment, so names containing a dash
    # (e.g. "J'ana - Brielle Ursu - Team Florida") keep the team correct.
    sk_re = re.compile(r'^(?:(\d+)\s+)?(?:(SC|DQ|DNF|DNS|NS|FS)\s+)?#(\d+)\s+(.+)$')
    # trailing race time, e.g. "4:50.924", "58.31", "1:02.5"
    time_re = re.compile(r'\s+(\d{1,2}:\d{2}\.\d{1,3}|\d{1,3}\.\d{1,3})\s*$')

    def split_name_team(rest):
        parts = rest.rsplit(' - ', 1)
        if len(parts) == 2:
            return parts[0].strip(), parts[1].strip()
        return rest.strip(), ''

    for l in lines[1:]:
        if l.startswith("Page ") or l.startswith("Pl ") or l.lower().startswith("pl skater"):
            continue
        s = sec_re.match(l)
        if s and not sk_re.match(l):
            kind = s.group(1).lower()
            num = s.group(2) or ""
            qual = s.group(3) or ""
            cur = {"round": kind, "number": num, "toQualify": qual, "skaters": []}
            heats.append(cur)
            continue
        sk = sk_re.match(l)
        if sk:
            place, status, helmet, rest = sk.groups()
            time = ""
            tm = time_re.search(rest)
            if tm:
                time = tm.group(1)
                rest = rest[:tm.start()]
            name, team = split_name_team(rest)
            if cur is None:
                # skaters before any section header → implicit single final
                cur = {"round": "final", "number": "", "toQualify": "", "skaters": []}
                heats.append(cur)
            cur["skaters"].append({"status": status or "", "helmet": helmet,
                                   "name": name, "team": team,
                                   "place": place or "", "time": time})

    return {"division": division, "distance": distance, "rounds": heats}

if __name__ == "__main__":
    for path in sys.argv[1:]:
        r = parse_sheet(path)
        print(f"\n=== {path.split('/')[-1]} ===")
        print(f"Division: {r['division']} | Distance: {r['distance']} | rounds: {len(r['rounds'])}")
        for rd in r["rounds"]:
            print(f"  {rd['round']} #{rd['number']} ({rd['toQualify']} to qualify) — {len(rd['skaters'])} skaters")
            for sk in rd["skaters"][:3]:
                tag = f"[{sk['status']}] " if sk['status'] else ""
                print(f"     {tag}#{sk['helmet']} {sk['name']} — {sk['team']}")
