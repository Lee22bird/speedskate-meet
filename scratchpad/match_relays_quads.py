import sys, glob, os, re, json, unicodedata
sys.path.insert(0, "/Users/leebird/Documents/GitHub/speedskate-meet/tools/nationals")
from relay_parse import parse_relay_sheet
from parse_heats import parse_sheet

B = "/Users/leebird/Documents/GitHub/IDN 2026"

def norm(n):
    n = unicodedata.normalize("NFKD", str(n or "")).encode("ascii", "ignore").decode()
    n = n.lower().strip()
    n = re.sub(r"[^a-z ]", " ", n)      # drop punctuation/digits
    n = re.sub(r"\s+", " ", n).strip()
    return n

# ---- load dev roster (data/nationalsRoster.js is `module.exports = [ {...}, ... ]`) ----
raw = open("/Users/leebird/Documents/GitHub/speedskate-meet/data/nationalsRoster.js", encoding="utf-8").read()
raw = raw[raw.index("["): raw.rindex("]") + 1]
roster = json.loads(raw)
by_name = {}
by_fl = {}   # (first, last) token -> roster skaters, to catch middle-name variations
def fl_key(n):
    toks = norm(n).split()
    return (toks[0], toks[-1]) if len(toks) >= 2 else None
for r in roster:
    by_name.setdefault(norm(r["name"]), []).append(r)
    k = fl_key(r["name"])
    if k: by_fl.setdefault(k, []).append(r)
print(f"dev roster: {len(roster)} skaters, {len(by_name)} unique normalized names")

def lookup(nn):
    if nn in by_name: return by_name[nn]
    toks = nn.split()
    if len(toks) >= 2:
        return by_fl.get((toks[0], toks[-1]))   # first+last fallback
    return None

# accumulators keyed by normalized name
part = {}  # name -> {'ir': set sizes, 'qr': set sizes, 'q': bool}
def touch(n):
    return part.setdefault(n, {"ir": set(), "qr": set(), "q": False})

def size_from_path(p):
    m = re.search(r"(\d)\s*person", p.lower())
    return int(m.group(1)) if m else None

# ---- inline relays ----
ir_names = set()
for p in glob.glob(os.path.join(B, "Inlines8", "00 Relays", "**", "*.pdf"), recursive=True):
    size = size_from_path(p)
    if not size: continue
    try: data = parse_relay_sheet(p)
    except Exception: continue
    for rd in data["rounds"]:
        for t in rd["teams"]:
            for m in t["members"]:
                nn = norm(m)
                if not nn: continue
                ir_names.add(nn); touch(nn)["ir"].add(size)

# ---- quad relays ----
qr_names = set()
for p in glob.glob(os.path.join(B, "Quads", "00 Relays", "**", "*.pdf"), recursive=True):
    size = size_from_path(p)
    if not size: continue
    try: data = parse_relay_sheet(p)
    except Exception: continue
    for rd in data["rounds"]:
        for t in rd["teams"]:
            for m in t["members"]:
                nn = norm(m)
                if not nn: continue
                qr_names.add(nn); touch(nn)["qr"].add(size)

# ---- quad individual ----
q_names = set()
for p in glob.glob(os.path.join(B, "Quads", "**", "*.pdf"), recursive=True):
    if "00 Relays" in p: continue
    try: data = parse_sheet(p)
    except Exception: continue
    for rd in data["rounds"]:
        for sk in rd["skaters"]:
            nn = norm(sk["name"])
            if not nn: continue
            q_names.add(nn); touch(nn)["q"] = True

print(f"parsed participation: inline-relay names={len(ir_names)}, quad-relay names={len(qr_names)}, quad-individual names={len(q_names)}")

# ---- match to dev roster ----
matched = {"ir": 0, "qr": 0, "q": 0}
enrich = {}      # roster name (original) -> flags
unmatched = {"ir": [], "qr": [], "q": []}
for nn, flags in part.items():
    hits = lookup(nn)
    if hits:
        for r in hits:
            e = enrich.setdefault(r["name"], {"inlineRelays": set(), "quadRelays": set(), "quad": False})
            e["inlineRelays"] |= flags["ir"]
            e["quadRelays"] |= flags["qr"]
            e["quad"] = e["quad"] or flags["q"] or bool(flags["qr"])
        if flags["ir"]: matched["ir"] += 1
        if flags["qr"]: matched["qr"] += 1
        if flags["q"]: matched["q"] += 1
    else:
        if flags["ir"]: unmatched["ir"].append(nn)
        if flags["qr"]: unmatched["qr"].append(nn)
        if flags["q"]: unmatched["q"].append(nn)

roster_with = sum(1 for r in roster if r["name"] in enrich)
print(f"\n=== MATCH RESULTS (of {len(roster)} dev skaters) ===")
print(f"skaters enriched (any relay/quad): {roster_with}")
print(f"  entered inline relays: {sum(1 for e in enrich.values() if e['inlineRelays'])}")
print(f"  entered quads:         {sum(1 for e in enrich.values() if e['quad'])}")
print(f"  entered quad relays:   {sum(1 for e in enrich.values() if e['quadRelays'])}")
print(f"\nunmatched relay/quad names (in results but NOT in dev roster):")
print(f"  inline-relay unmatched: {len(unmatched['ir'])}, quad unmatched: {len(unmatched['q'])}, quad-relay unmatched: {len(unmatched['qr'])}")
print("  sample inline-relay unmatched:", unmatched["ir"][:8])

# save enrichment
out = {r["name"]: {"inlineRelays": sorted(e["inlineRelays"]), "quadRelays": sorted(e["quadRelays"]), "quad": e["quad"]}
       for r, e in ((r, enrich[r["name"]]) for r in roster if r["name"] in enrich)}
json.dump(out, open("/Users/leebird/Documents/GitHub/speedskate-meet/scratchpad/roster_enrichment.json", "w"), indent=0)
print(f"\nwrote enrichment for {len(out)} skaters -> scratchpad/roster_enrichment.json")
# show a few examples
for name in list(out)[:6]:
    print("  ", name, out[name])
