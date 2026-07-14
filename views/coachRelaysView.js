const { RELAY_DIVISIONS, eligibleForRelayDivision } = require('../services/relayDivisions');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Coach relay team builder. Coach forms teams from their club's age/gender-
// eligible skaters via dropdowns; each filled team is saved as a relay entry.
// No-split-club is automatic (only this club's skaters appear). Color is left
// to the tabulator. Locks after the meet's relay deadline.
function renderCoachRelaysView({ meet, club, skaters, locked, savedCount }) {
  const clubKey = String(club || '').trim().toLowerCase();
  const myTeams = (meet.relayTeams || []).filter(t => String(t.club || '').trim().toLowerCase() === clubKey);
  const byDiv = new Map();
  myTeams.forEach(t => { const a = byDiv.get(t.divisionId) || []; a.push(t); byDiv.set(t.divisionId, a); });

  const fieldable = RELAY_DIVISIONS
    .map(d => ({ d, elig: eligibleForRelayDivision(d, skaters) }))
    .filter(x => x.elig.length >= x.d.size || (byDiv.get(x.d.id) || []).length);

  const options = (elig, selected) =>
    `<option value="">— pick a skater —</option>` +
    elig.map(s => `<option value="${esc(s.id)}"${String(s.id) === String(selected) ? ' selected' : ''}>${esc(s.name)} (${esc(s.age)})</option>`).join('');

  const teamRow = (d, ti, members, elig) => {
    const slots = [];
    for (let s = 0; s < d.size; s++) {
      slots.push(`<select name="t_${esc(d.id)}_${ti}_${s}" class="rl-slot"${locked ? ' disabled' : ''}>${options(elig, members[s])}</select>`);
    }
    return `<div class="rl-team"><span class="rl-team-n">Team ${ti + 1}</span><div class="rl-slots">${slots.join('')}</div></div>`;
  };

  const sections = fieldable.map(({ d, elig }) => {
    const existing = byDiv.get(d.id) || [];
    const rows = [];
    existing.forEach((t, ti) => rows.push(teamRow(d, ti, t.memberRegIds || [], elig)));
    for (let n = 0; n < 2; n++) rows.push(teamRow(d, existing.length + n, [], elig)); // 2 blank team slots
    return `
      <section class="rl-div">
        <div class="rl-div-head">
          <strong>${esc(d.label)}</strong>
          <span class="rl-dist">${esc(d.distance)} · ${d.size}-person</span>
          <span class="chip">${elig.length} eligible</span>
        </div>
        ${rows.join('')}
      </section>`;
  }).join('');

  const deadlineNote = meet.relayDeadline
    ? `<div class="rl-deadline${locked ? ' rl-locked' : ''}">${locked ? '🔒 Relay entries are locked' : '⏰ Relay entries due'}: ${esc(meet.relayDeadline)}</div>`
    : '';

  return `
    <div class="page-header">
      <h1>Relay Teams — ${esc(club || 'Your Club')}</h1>
      <div class="sub">Build your relay teams from your club's skaters. Pick each team's members; only your own skaters appear (no split-club teams). Colors are assigned by the tabulator on race day.</div>
    </div>
    ${savedCount != null ? `<div class="card" style="border-left:4px solid var(--green)"><div class="good">✅ Saved ${esc(savedCount)} relay team${savedCount === 1 ? '' : 's'}.</div></div>` : ''}
    ${deadlineNote}
    ${fieldable.length ? `
      <form method="POST" action="/portal/meet/${esc(meet.id)}/coach/relays">
        ${sections}
        ${locked ? '' : `<div class="action-row" style="margin-top:16px"><button class="btn-orange" type="submit">Save Relay Teams</button><a class="btn2" href="/portal/meet/${esc(meet.id)}/coach">Back to Coach Portal</a></div>`}
      </form>` : `<div class="card"><div class="muted">None of your registered skaters are eligible for a relay division yet. Register skaters (with the relay option) first.</div></div>`}

    <style>
      .rl-deadline{display:inline-block;font-weight:800;font-size:14px;color:var(--navy);background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:8px 14px;margin-bottom:14px}
      .rl-deadline.rl-locked{color:#b91c1c;background:#fef2f2;border-color:#fecaca}
      .rl-div{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:12px}
      .rl-div-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
      .rl-div-head strong{color:var(--navy);font-size:17px}
      .rl-dist{color:var(--muted);font-size:13px;font-weight:600}
      .rl-team{display:flex;align-items:center;gap:10px;padding:6px 0;flex-wrap:wrap}
      .rl-team-n{flex:0 0 64px;font-weight:700;color:var(--muted);font-size:13px}
      .rl-slots{display:flex;gap:8px;flex-wrap:wrap;flex:1}
      .rl-slot{min-width:180px;flex:1;padding:9px 10px;border:1px solid var(--border2);border-radius:8px;background:#fff;font-size:14px}
    </style>`;
}

module.exports = { renderCoachRelaysView };
