const { esc } = require('../utils/html');
const { RELAY_DIVISIONS, RELAY_DIVISION_BY_ID } = require('../services/relayDivisions');

function toggleSwitch(name, checked, label = '', value = 'on') {
  return `
    <label class="toggle-wrap">
      <input type="checkbox" name="${esc(name)}" value="${esc(value)}" class="toggle-input" ${checked ? 'checked' : ''} />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      ${label ? `<span class="toggle-label">${esc(label)}</span>` : ''}
    </label>`;
}

function relayAgeRange(row) {
  return String(row?.ageRange || row?.ages || '').trim();
}

// Summary of coach-submitted teams (meet.relayTeams) grouped by division, in the
// canonical RELAY_DIVISIONS order.
function submittedTeamsSummary(meet) {
  const teams = (meet.relayTeams || []).filter(t => Array.isArray(t.memberRegIds) && t.memberRegIds.length);
  const byDiv = new Map();
  for (const t of teams) {
    if (!RELAY_DIVISION_BY_ID.has(t.divisionId)) continue;
    byDiv.set(t.divisionId, (byDiv.get(t.divisionId) || 0) + 1);
  }
  const rows = RELAY_DIVISIONS
    .filter(d => byDiv.has(d.id))
    .map(d => ({ label: d.label, distance: d.distance, count: byDiv.get(d.id) }));
  return { total: teams.length, rows };
}

function renderRelayBuilderView({ meet, saved = false, added = '', gen = null }) {
  meet.relayTemplates = Array.isArray(meet.relayTemplates) ? meet.relayTemplates : [];
  const relayRaces = (meet.races || []).filter(r => r.isRelayRace);
  const submitted = submittedTeamsSummary(meet);

  const relayRows = relayRaces.map(r => `
    <tr>
      <td><strong>${esc(r.groupLabel)}</strong><div class="note">${esc(r.relayType || 'Relay')} ${r.relayAgeGroup ? `• ${esc(r.relayAgeGroup)}` : ''}</div></td>
      <td>${esc(r.ages || r.relayAgeRange || '—')}</td>
      <td>${esc(r.distanceLabel)}</td>
      <td>${esc(r.notes || '—')}</td>
      <td><span class="chip chip-${r.status === 'closed' ? 'green' : 'sky'}">${esc(r.status)}</span></td>
      <td>
        <form method="POST" action="/portal/meet/${meet.id}/relay-builder/delete" style="display:inline">
          <input type="hidden" name="raceId" value="${esc(r.id)}" />
          <button class="btn-danger btn-sm" type="submit">Delete</button>
        </form>
      </td>
    </tr>`).join('');

  const templateGroups = ['3 Person', '2 Person', '4 Person'].map(type => {
    const rows = meet.relayTemplates.map((row, idx) => ({ row, idx })).filter(x => x.row.type === type);
    return `
      <div class="relay-type-card">
        <div class="row between center" style="margin-bottom:12px">
          <div>
            <h3 style="margin:0">${esc(type)} Relays</h3>
            <div class="note">Enable the age groups you want, adjust labels, age ranges, distances, and notes, then click Save Relay Builder.</div>
          </div>
          <button class="btn2 btn-sm" type="button" onclick="this.closest('.relay-type-card').querySelectorAll('input.toggle-input').forEach(cb=>cb.checked=true)">Select ${esc(type)}</button>
        </div>
        <div class="relay-card-grid">
          ${rows.map(({ row, idx }) => `
            <div class="relay-template-card">
              <div class="row between center" style="margin-bottom:12px">
                <div class="toggle-row-label">${esc(row.age)}</div>
                ${toggleSwitch(`enabled_${idx}`, !!row.enabled, '', 'on')}
              </div>
              <input type="hidden" name="relayType_${idx}" value="${esc(row.type)}" />
              <div><label>Relay Label</label><input name="ageGroup_${idx}" value="${esc(row.age)}" placeholder="Juvenile, Freshman, Senior..." /></div>
              <div class="grid-2 tight-grid">
                <div><label>Age Range</label><input name="ageRange_${idx}" value="${esc(relayAgeRange(row))}" placeholder="9 & Under, 10-13, 14 & Older" /></div>
                <div><label>Relay Type</label><input value="${esc(row.type)}" disabled /></div>
              </div>
              <div class="grid-2 tight-grid">
                <div><label>Distance</label><input name="distance_${idx}" value="${esc(row.distance)}" /></div>
                <div><label>Lap / Rotation Notes</label><input name="notes_${idx}" value="${esc(row.notes)}" /></div>
              </div>
              <div class="note" style="margin-top:8px">Judges Panel will show skaters who selected this relay type and match this age range using the meet's January 1 competition-year age.</div>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="builder-banner" style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);margin-bottom:18px">
      <h2>🔄 Relay Builder</h2>
      <div class="sub">Create 2-person, 3-person, and 4-person relay races. Registration pricing counts each selected event category after the first as an additional event.</div>
    </div>

    ${saved ? '<div class="good" style="margin-bottom:12px">✅ Relay Builder saved.</div>' : ''}
    ${added ? `<div class="good" style="margin-bottom:12px">✅ Relay Builder saved. Added ${esc(added)} new relay race(s).</div>` : ''}
    ${gen ? `<div class="good" style="margin-bottom:12px">✅ Generated relay races from submitted teams — ${esc(gen.created)} final${gen.created===1?'':'s'} created, ${esc(gen.updated)} refreshed${gen.skipped ? `, ${esc(gen.skipped)} skipped (results already entered)` : ''}.${(gen.bracketed&&gen.bracketed.length) ? ` <strong>Split into heats:</strong> ${gen.bracketed.map(esc).join(', ')}.` : ''}${gen.needsHeats.length ? ` <strong>3-person, needs time-based heats (coming):</strong> ${gen.needsHeats.map(esc).join(', ')}.` : ''}</div>` : ''}

    <div class="card" style="margin-top:16px;border-left:4px solid var(--orange)">
      <div class="row between center" style="flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="margin:0">🛼 Submitted Relay Teams</h2>
          <div class="note">${submitted.total ? `${esc(submitted.total)} team${submitted.total === 1 ? '' : 's'} submitted by coaches. Generate races to pre-load these teams into relay finals.` : 'No relay teams submitted yet. Coaches build teams from the Coach Panel → Build Relay Teams.'}</div>
        </div>
        ${submitted.total ? `
        <form method="POST" action="/portal/meet/${meet.id}/relay-builder/generate-from-teams" style="display:inline">
          <button class="btn-orange" type="submit">Generate Races from Teams →</button>
        </form>` : ''}
      </div>
      ${submitted.total ? `
      <table class="table" style="margin-top:12px">
        <thead><tr><th>Division</th><th>Distance</th><th>Teams</th></tr></thead>
        <tbody>${submitted.rows.map(r => `<tr><td><strong>${esc(r.label)}</strong></td><td>${esc(r.distance)}</td><td><span class="chip chip-sky">${esc(r.count)}</span></td></tr>`).join('')}</tbody>
      </table>` : ''}
    </div>

    <div class="card" style="margin-top:16px">
      <style>
        .relay-type-card{background:#eef3f8;border:1px solid rgba(15,31,61,.10);border-radius:18px;padding:18px;margin-top:14px;}
        .relay-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}
        .relay-template-card{background:#f8fafc;border:1px solid rgba(15,31,61,.10);border-radius:16px;padding:16px;box-shadow:0 1px 4px rgba(15,31,61,.04);}
        .relay-template-card label{margin-top:8px;}
        .tight-grid{gap:10px;}
        @media(max-width:900px){.relay-card-grid{grid-template-columns:1fr;}}
      </style>
      <div class="row between center" style="margin-bottom:12px">
        <div>
          <h2 style="margin:0">Relay Setup</h2>
          <div class="note">Enable relay groups, manually set age ranges like Open Builder, then click Save Relay Builder. This page does not autosave.</div>
        </div>
        <div class="action-row">
          <button class="btn2 btn-sm" type="button" onclick="document.querySelectorAll('.relay-type-card input.toggle-input').forEach(cb=>cb.checked=true)">Select All Relay Cards</button>
          <button class="btn-sky btn-sm" type="submit" form="relayBuilderForm">Save Relay Builder</button>
        </div>
      </div>
      <form id="relayBuilderForm" method="POST" action="/portal/meet/${meet.id}/relay-builder/add-template">
        ${templateGroups}
        <div class="action-row" style="margin-top:16px">
          <button class="btn-sky" type="submit">Save Relay Builder</button>
        </div>
      </form>
    </div>

    ${relayRaces.length ? `
    <div class="card" style="margin-top:16px">
      <div class="row between" style="margin-bottom:12px">
        <h2 style="margin:0">Relay Races (${relayRaces.length})</h2>
        <span class="chip chip-sky">🔄 Manual fill-in on race day</span>
      </div>
      <table class="table">
        <thead><tr><th>Name</th><th>Age Range</th><th>Distance</th><th>Notes</th><th>Status</th><th></th></tr></thead>
        <tbody>${relayRows}</tbody>
      </table>
    </div>` : ''}`;
}

module.exports = {
  renderRelayBuilderView,
};
