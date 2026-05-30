const { esc, cap } = require('../utils/html');

function toggleSwitch(name, checked, label = '', value = 'on') {
  return `
    <label class="toggle-wrap">
      <input type="checkbox" name="${esc(name)}" value="${esc(value)}" class="toggle-input" ${checked ? 'checked' : ''} />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      ${label ? `<span class="toggle-label">${esc(label)}</span>` : ''}
    </label>`;
}

function renderOpenBuilderView({ meet, openGroupDefaults = [], saved = false }) {
  const openGroups = Array.isArray(meet.openGroups) ? meet.openGroups : [];
  const enabledCount = openGroups.filter(g => g.enabled).length;
  const savedFlashOpen = saved
    ? '<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Open Builder saved.</div></div>'
    : '';

  const openGroupPairs = [];
  for (let i = 0; i < openGroups.length; i += 2) {
    openGroupPairs.push([i, i + 1].filter(x => x < openGroups.length));
  }

  const groupCards = openGroupPairs.map(pair => {
    const cards = pair.map(i => {
      const og = openGroups[i];
      const def = openGroupDefaults[i] || {};
      const liveRace = (meet.races || []).find(r => r.isOpenRace && r.groupId === og.id && !r.isTimeTrial);

      return `
        <div class="open-group-card" style="flex:1">
          <div class="row between center" style="margin-bottom:12px">
            <div>
              <div style="font-weight:700;font-size:16px;color:var(--navy)">${esc(og.label)}</div>
              <div style="max-width:180px;margin-top:5px">
                <input name="og_${i}_ages" value="${esc(og.ages)}" placeholder="${esc(def.ages || '')}" style="padding:6px 9px;font-size:13px" />
              </div>
            </div>
            ${toggleSwitch(`og_${i}_enabled`, og.enabled, 'Open Race')}
          </div>
          <div class="form-grid cols-2" style="margin-bottom:14px">
            <div>
              <label>Open Distance</label>
              <input name="og_${i}_distance" value="${esc(og.distance)}" placeholder="${esc(def.defaultDistance || '')}" />
              <div class="note">Uses the global Open Event fee from Meet Setup.</div>
            </div>
            <div style="display:flex;align-items:flex-end">
              ${liveRace ? `<div class="chip chip-green">Open Entries: ${(liveRace.laneEntries || []).length}</div>` : '<div class="note">Open race generated on save.</div>'}
            </div>
          </div>
        </div>`;
    });

    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">${cards.join('')}</div>`;
  }).join('');

  const openRaces = (meet.races || []).filter(r => r.isOpenRace);

  return `
    <div class="builder-banner orange">
      <h2>🏁 Open Builder</h2>
      <div class="sub">Rolling-start pack finals • No lane limit • No points • Results separate from inline standings</div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row between center">
        <div><strong>${enabledCount} of ${openGroups.length} groups enabled</strong></div>
        <div class="row"><span class="chip chip-orange">Rolling Start</span><span class="chip chip-orange">No Lane Cap</span><span class="chip chip-orange">No Points</span></div>
      </div>
    </div>
    ${savedFlashOpen}
    <form method="POST" action="/portal/meet/${meet.id}/open-builder/save" class="stack">
      ${groupCards}
      <div class="card">
        <div class="row between center">
          <div class="muted">Saving generates or updates Open races. Existing entries are preserved.</div>
          <div class="action-row">
            <a class="btn2" href="/portal/meet/${meet.id}/builder">← Meet Builder</a>
            <button class="btn-orange" type="submit">Save Open Builder</button>
          </div>
        </div>
      </div>
    </form>
    ${openRaces.length ? `
      <div class="spacer"></div>
      <div class="card">
        <h3>Generated Open Races</h3>
        <table class="table">
          <thead><tr><th>Group</th><th>Distance</th><th>Start</th><th>Entries</th><th>Status</th></tr></thead>
          <tbody>${openRaces.map(r => `<tr><td>${esc(r.groupLabel)}</td><td>${esc(r.distanceLabel)}</td><td>${esc(cap(r.startType))}</td><td>${(r.laneEntries || []).length}</td><td><span class="chip chip-${r.status === 'closed' ? 'green' : 'sky'}">${esc(r.status)}</span></td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}`;
}

module.exports = {
  renderOpenBuilderView,
};
