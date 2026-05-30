const { esc } = require('../utils/html');

function toggleSwitch(name, checked, label = '', value = 'on') {
  return `
    <label class="toggle-wrap">
      <input type="checkbox" name="${esc(name)}" value="${esc(value)}" class="toggle-input" ${checked ? 'checked' : ''} />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      ${label ? `<span class="toggle-label">${esc(label)}</span>` : ''}
    </label>`;
}

function renderRelayBuilderView({ meet, saved = false, added = '' }) {
  meet.relayTemplates = Array.isArray(meet.relayTemplates) ? meet.relayTemplates : [];
  const relayRaces = (meet.races || []).filter(r => r.isRelayRace);

  const relayRows = relayRaces.map(r => `
    <tr>
      <td><strong>${esc(r.groupLabel)}</strong><div class="note">${esc(r.relayType || 'Relay')} ${r.relayAgeGroup ? `• ${esc(r.relayAgeGroup)}` : ''}</div></td>
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
            <div class="note">Enable the age groups you want, adjust labels/distances, then click Save Relay Builder.</div>
          </div>
          <button class="btn2 btn-sm" type="button" onclick="this.closest('.relay-type-card').querySelectorAll('input[type=checkbox]').forEach(cb=>cb.checked=true)">Select ${esc(type)}</button>
        </div>
        <div class="relay-card-grid">
          ${rows.map(({ row, idx }) => `
            <div class="relay-template-card">
              <div class="row between center" style="margin-bottom:10px">
                <div class="toggle-row-label">${esc(row.age)}</div>
                ${toggleSwitch(`enabled_${idx}`, !!row.enabled, '', 'on')}
              </div>
              <input type="hidden" name="relayType_${idx}" value="${esc(row.type)}" />
              <div><label>Age Group</label><input name="ageGroup_${idx}" value="${esc(row.age)}" /></div>
              <div class="grid-2 tight-grid">
                <div><label>Distance</label><input name="distance_${idx}" value="${esc(row.distance)}" /></div>
                <div><label>Relay Type</label><input value="${esc(row.type)}" disabled /></div>
              </div>
              <div><label>Lap / Rotation Notes</label><input name="notes_${idx}" value="${esc(row.notes)}" /></div>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="builder-banner" style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);margin-bottom:18px">
      <h2>🔄 Relay Builder</h2>
      <div class="sub">Create 2-person, 3-person, and 4-person relay races. Registration pricing counts each selected event category after the first as an additional event.</div>
    </div>

    ${saved ? '<div class="good" style="margin-bottom:12px">✅ Saved.</div>' : ''}
    ${added ? `<div class="good" style="margin-bottom:12px">✅ Relay Builder saved. Added ${esc(added)} new relay race(s).</div>` : ''}

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
          <h2 style="margin:0">Quick Add MSSL-Style Relay Set</h2>
          <div class="note">Enable relay groups, adjust labels/distances, then click Save Relay Builder. This page does not autosave.</div>
        </div>
        <div class="action-row">
          <button class="btn2 btn-sm" type="button" onclick="document.querySelectorAll('.relay-type-card input[type=checkbox]').forEach(cb=>cb.checked=true)">Select All</button>
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
        <thead><tr><th>Name</th><th>Distance</th><th>Notes</th><th>Status</th><th></th></tr></thead>
        <tbody>${relayRows}</tbody>
      </table>
    </div>` : ''}`;
}

module.exports = {
  renderRelayBuilderView,
};
