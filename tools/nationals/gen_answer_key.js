// Generate a printable race-by-race "answer key" for the Nationals data.
//
// Reads data/nationals_heats.js (schedule-ordered day -> session -> event ->
// rounds -> skaters) and writes a self-contained, print-optimized HTML page:
// every race in running order with helmet / skater / team / place. Handy for
// checking SSM's generated brackets + scored results against the real meet.
//
//   node tools/nationals/gen_answer_key.js
//   -> writes tools/nationals/nationals_answer_key.html  (open it, then Cmd/Ctrl+P)

const fs = require('fs');
const path = require('path');
const N = require(path.join(__dirname, '..', '..', 'data', 'nationals_heats.js'));
const OUT = path.join(__dirname, 'nationals_answer_key.html');

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let events = 0, rounds = 0, entries = 0;
let body = '';
const dayLinks = [];

for (const day of N.days || []) {
  const id = 'd-' + slug(day.date);
  dayLinks.push(`<a href="#${id}">${esc(day.date)}</a>`);
  body += `<h2 class="day" id="${id}">${esc(day.date)}</h2>`;
  for (const session of day.sessions || []) {
    if (session.label) body += `<div class="session">${esc(session.label)}</div>`;
    for (const ev of session.events || []) {
      if (!(ev.rounds || []).length) continue;
      events++;
      const meta = [ev.distance, ev.format, ev.qualify].filter(Boolean).map(esc).join(' &middot; ');
      const num = ev.num ? `<span class="num">#${esc(ev.num)}</span>` : '';
      body += `<section class="event"><div class="ev-head">${num}<span class="ev-div">${esc(ev.division)}</span>${meta ? `<span class="ev-meta">${meta}</span>` : ''}</div>`;
      for (const rd of ev.rounds || []) {
        rounds++;
        const q = rd.toQualify ? `<span class="q">${esc(rd.toQualify)} advance</span>` : '';
        body += `<div class="round"><div class="rd-label">${esc(rd.label)}${q}</div><table class="skaters"><tbody>`;
        for (const s of rd.skaters || []) {
          entries++;
          const sc = s.scratched ? '<span class="sc">SC</span>' : '';
          const pl = s.place ? esc(s.place) : '';
          body += `<tr><td class="hel">${esc(s.helmet)}</td><td class="nm">${esc(s.name)} ${sc}</td><td class="tm">${esc(s.team)}</td><td class="pl">${pl}</td></tr>`;
        }
        body += `</tbody></table></div>`;
      }
      body += `</section>`;
    }
  }
}

const style = `
<style>
  :root { --paper:#ffffff; --ink:#14181f; --navy:#14243f; --accent:#c25a1c; --muted:#5b6472; --rule:#d5dbe4; --rule-soft:#e8ecf2; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --paper:#0f141c; --ink:#e7ecf3; --navy:#2a3d63; --accent:#e0793a; --muted:#9aa6b6; --rule:#2a3342; --rule-soft:#1b222d; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { background: var(--paper); color: var(--ink); font-family: -apple-system, "Segoe UI", system-ui, Roboto, Arial, sans-serif; font-size: 12px; line-height: 1.32; margin: 0; padding: 18px 22px 40px; }
  h1 { font-size: 21px; letter-spacing: -.01em; margin: 0 0 3px; }
  .sub { color: var(--muted); font-size: 12px; margin: 0 0 4px; }
  .legend { color: var(--muted); font-size: 11px; margin: 0 0 14px; }
  .legend b { color: var(--ink); }
  .dayindex { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 0 0 18px; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 7px; }
  .dayindex a { color: var(--navy); text-decoration: none; font-weight: 700; font-size: 11px; }
  h2.day { font-size: 15px; font-weight: 800; background: var(--navy); color: #fff; padding: 7px 11px; border-radius: 5px; margin: 22px 0 9px; page-break-after: avoid; break-after: avoid; }
  .session { font-weight: 800; color: var(--navy); font-size: 13px; border-bottom: 2px solid var(--rule); margin: 13px 0 7px; padding-bottom: 3px; page-break-after: avoid; break-after: avoid; }
  .event { border: 1px solid var(--rule); border-radius: 6px; padding: 8px 10px; margin: 0 0 9px; page-break-inside: avoid; break-inside: avoid; }
  .ev-head { font-size: 13px; margin-bottom: 4px; display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
  .num { color: var(--muted); font-weight: 800; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .ev-div { font-weight: 800; }
  .ev-meta { color: var(--muted); font-weight: 500; font-size: 11px; }
  .round { margin: 5px 0 0 2px; page-break-inside: avoid; break-inside: avoid; }
  .rd-label { display: flex; align-items: baseline; gap: 8px; font-weight: 800; color: var(--accent); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; margin: 6px 0 2px; }
  .rd-label .q { color: var(--muted); text-transform: none; letter-spacing: 0; font-weight: 600; }
  table.skaters { border-collapse: collapse; width: 100%; }
  table.skaters tr { border-bottom: 1px solid var(--rule-soft); }
  table.skaters tr:last-child { border-bottom: 0; }
  table.skaters td { padding: 2px 8px 2px 0; vertical-align: baseline; }
  td.hel { width: 46px; text-align: right; font-weight: 800; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-variant-numeric: tabular-nums; }
  td.nm { width: 42%; }
  td.tm { color: var(--muted); }
  td.pl { width: 30px; text-align: center; font-weight: 800; color: var(--navy); font-family: ui-monospace, "SF Mono", Menlo, monospace; font-variant-numeric: tabular-nums; }
  .sc { color: #b32020; font-weight: 800; font-size: 9px; }
  @media print {
    :root { --paper:#fff; --ink:#111; --navy:#14243f; --accent:#b3521a; --muted:#555; --rule:#c9d1dc; --rule-soft:#e3e8ef; }
    body { padding: 0; font-size: 10px; }
    .dayindex { display: none; }
    h2.day, td.pl { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .event, .round { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
</style>`;

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>2026 Indoor Nationals — Race-by-Race Answer Key</title>${style}</head><body>
<h1>2026 Indoor Nationals — Race-by-Race Answer Key</h1>
<div class="sub">${esc(N.subtitle || 'Schedule order')} &middot; ${events} events &middot; ${rounds} rounds</div>
<div class="legend">Schedule order. Each row is <b>helmet &middot; skater &middot; team &middot; place</b>. Use the entries to check SSM's generated heats/semis/finals and the <b>place</b> column for the scored results. <b>SC</b> = scratched.</div>
<nav class="dayindex">${dayLinks.join('')}</nav>
${body}
</body></html>`;

fs.writeFileSync(OUT, page);
console.log(`wrote ${OUT}`);
console.log(`  events: ${events}  rounds: ${rounds}  skater entries: ${entries}  (${Math.round(page.length / 1024)} KB)`);
console.log('  Open it in a browser and Cmd/Ctrl+P to print or save as PDF.');
