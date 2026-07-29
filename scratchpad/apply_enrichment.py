import json

ROSTER = "/Users/leebird/Documents/GitHub/speedskate-meet/data/nationalsRoster.js"
ENRICH = "/Users/leebird/Documents/GitHub/speedskate-meet/scratchpad/roster_enrichment.json"

raw = open(ROSTER, encoding="utf-8").read()
arr = json.loads(raw[raw.index("["): raw.rindex("]") + 1])
enrich = json.load(open(ENRICH))

n_relay = n_quad = n_qrelay = 0
out_lines = []
for s in arr:
    e = enrich.get(s["name"])
    # rebuild each entry with stable key order: helmet, name, team, division, + enrichment
    row = {"helmet": s.get("helmet", ""), "name": s["name"], "team": s.get("team", ""), "division": s.get("division", "")}
    if e:
        if e.get("inlineRelays"):
            row["relays"] = e["inlineRelays"]; n_relay += 1
        if e.get("quad"):
            row["quad"] = True; n_quad += 1
        if e.get("quadRelays"):
            row["quadRelays"] = e["quadRelays"]; n_qrelay += 1
    out_lines.append("  " + json.dumps(row, ensure_ascii=False))

header = ("// AUTO-GENERATED unique Nationals skater roster for the dev import.\n"
          "// Fields: helmet, name, team, division; plus real IDN 2026 participation —\n"
          "//   relays: inline relay sizes entered [2,3,4]; quad: entered a quad event;\n"
          "//   quadRelays: quad relay sizes entered [2,3]. Regenerate from IDN data.\n")
body = "module.exports = [\n" + ",\n".join(out_lines) + "\n];\n"
open(ROSTER, "w", encoding="utf-8").write(header + body)

print(f"rewrote {len(arr)} skaters")
print(f"  with inline relays: {n_relay}")
print(f"  with quad:          {n_quad}")
print(f"  with quad relays:   {n_qrelay}")
