const { esc } = require('../utils/html');

function toggleSwitch(name, checked, label = '', value = 'on') {
  return `
    <label class="toggle-wrap">
      <input type="checkbox" name="${esc(name)}" value="${esc(value)}" class="toggle-input" ${checked ? 'checked' : ''} />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      ${label ? `<span class="toggle-label">${esc(label)}</span>` : ''}
    </label>`;
}

function renderQuadBuilderView({ meet, quadGroupDefaults = [], saved = false, raceDisplayStage }) {
  const enabledCount = (meet.quadGroups || []).filter(g => g.enabled).length;
  const savedFlashQuad = saved
    ? '<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Quad Builder saved.</div></div>'
    : '';

  const quadGroupPairs = [];
  for (let i = 0; i < (meet.quadGroups || []).length; i += 2) {
    quadGroupPairs.push([i, i + 1].filter(x => x < meet.quadGroups.length));
  }

  const groupCards = quadGroupPairs.map(pair => {
    const cards = pair.map(i => {
      const qg = meet.quadGroups[i];
      const def = quadGroupDefaults[i];
      const liveRaces = (meet.races || []).filter(r => r.isQuadRace && r.groupId === qg.id);

      return `
        <div class="quad-group-card" style="flex:1">
          <div class="row between center" style="margin-bottom:12px">
            <div>
              <div style="font-weight:700;font-size:16px;color:var(--navy)">${esc(qg.label)}</div>
              <div class="note">${esc(qg.ages)}</div>
            </div>
            ${toggleSwitch(`qg_${i}_enabled`, qg.enabled, 'Enable')}
          </div>
          <div class="form-grid cols-2">
            <div>
              <label>Distance 1</label>
              <input name="qg_${i}_d1" value="${esc(qg.distances[0] || '')}" placeholder="${esc(def?.distances?.[0] || '')}" />
              <div class="note">Default: ${esc(def?.distances?.[0] || '')}</div>
            </div>
            <div>
              <label>Distance 2</label>
              <input name="qg_${i}_d2" value="${esc(qg.distances[1] || '')}" placeholder="${esc(def?.distances?.[1] || '')}" />
              <div class="note">Default: ${esc(def?.distances?.[1] || '')}</div>
            </div>
          </div>
          <div class="note" style="margin-top:8px">Uses the global Quad Event fee from Meet Setup.${liveRaces.length ? ` ${liveRaces.map(r => `${esc(r.distanceLabel)}: ${(r.laneEntries || []).length} entries`).join(' | ')}` : ''}</div>
        </div>`;
    });

    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">${cards.join('')}</div>`;
  }).join('');

  const quadRaces = (meet.races || []).filter(r => r.isQuadRace);
  const stageLabel = typeof raceDisplayStage === 'function' ? raceDisplayStage : (race => String(race?.stage || 'Race'));

  return `
    <div class="builder-banner purple">
      <h2>🛼 Quad Builder</h2>
      <div class="sub">30 / 20 / 10 / 5 points • Separate standings bucket • Heat splitting same as inline</div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row between center">
        <div><strong>${enabledCount} of ${(meet.quadGroups || []).length} groups enabled</strong></div>
        <div class="row"><span class="chip chip-purple">30/20/10/5 Pts</span><span class="chip chip-purple">Standing Start</span><span class="chip chip-purple">Heat Splitting</span></div>
      </div>
    </div>
    ${savedFlashQuad}
    <form method="POST" action="/portal/meet/${meet.id}/quad-builder/save" class="stack">
      ${groupCards}
      <div class="card">
        <div class="row between center">
          <div class="muted">Saving generates or updates Quad races. Existing entries are preserved.</div>
          <div class="action-row">
            <a class="btn2" href="/portal/meet/${meet.id}/builder">← Meet Builder</a>
            <button class="btn-purple" type="submit">Save Quad Builder</button>
          </div>
        </div>
      </div>
    </form>
    ${quadRaces.length ? `
      <div class="spacer"></div>
      <div class="card">
        <h3>Generated Quad Races</h3>
        <table class="table">
          <thead><tr><th>Group</th><th>Distance</th><th>Stage</th><th>Entries</th><th>Status</th></tr></thead>
          <tbody>${quadRaces.map(r => `<tr><td>${esc(r.groupLabel)}</td><td>${esc(r.distanceLabel)}</td><td>${esc(stageLabel(r))}</td><td>${(r.laneEntries || []).length}</td><td><span class="chip chip-${r.status === 'closed' ? 'green' : 'sky'}">${esc(r.status)}</span></td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}`;
}

module.exports = {
  renderQuadBuilderView,
};
