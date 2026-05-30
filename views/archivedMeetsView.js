const { esc } = require('../utils/html');
const { canEditMeet } = require('../utils/auth');

function meetRinkLabel(db, meet) {
  const custom = String(meet?.customRinkName || '').trim();
  if (custom) return custom;
  const rink = (db.rinks || []).find(r => Number(r.id) === Number(meet?.rinkId));
  if (!rink) return '';
  return [rink.name, rink.city, rink.state].filter(Boolean).join(' • ');
}

function meetDateLabel(meet) {
  const start = String(meet?.date || '').trim();
  const end = String(meet?.endDate || '').trim();
  if (start && end && start !== end) return `${start} to ${end}`;
  return start;
}

function countArchivedRaceTypes(meet) {
  const races = meet.races || [];
  return {
    inline: races.filter(r => !r.isOpenRace && !r.isQuadRace && !r.isTimeTrial && !r.isRelayRace && !r.isSkateabilityRace && !r.isSpecialRace).length,
    open: races.filter(r => r.isOpenRace).length,
    quad: races.filter(r => r.isQuadRace).length,
    timeTrials: races.filter(r => r.isTimeTrial).length,
    relays: races.filter(r => r.isRelayRace).length,
    skateability: races.filter(r => r.isSkateabilityRace).length,
    special: races.filter(r => r.isSpecialRace).length,
    closed: races.filter(r => String(r.status || '') === 'closed').length,
    total: races.length,
  };
}

function renderArchivedMeetsView({ db, user, archived = [] }) {
  const cards = archived.map(meet => {
    const archivedBy = (db.users || []).find(u => Number(u.id) === Number(meet.archivedByUserId));
    const counts = countArchivedRaceTypes(meet);
    const registrationCount = (meet.registrations || []).length;
    const archivedDate = meet.archivedAt ? new Date(meet.archivedAt).toLocaleDateString() : 'Unknown';
    const rinkLabel = meetRinkLabel(db, meet);
    const meetDate = meetDateLabel(meet) || 'Date TBD';

    return `
      <div class="card" style="margin-bottom:14px;border-left:4px solid var(--green)">
        <div class="row between" style="gap:14px;align-items:flex-start;margin-bottom:14px">
          <div style="min-width:260px">
            <div class="muted" style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Archived Meet</div>
            <h2 style="margin:0 0 4px">${esc(meet.meetName)}</h2>
            <div class="muted" style="font-size:13px;line-height:1.55">
              ${rinkLabel ? `${esc(rinkLabel)}<br/>` : ``}
              ${esc(meetDate)}<br/>
              Archived ${esc(archivedDate)}${archivedBy ? ` by ${esc(archivedBy.displayName || archivedBy.name || archivedBy.username || '')}` : ''}
            </div>
          </div>

          <div class="mini-card" style="padding:12px;border:1px solid var(--border);border-radius:14px;background:#f8fafc;min-width:260px;flex:1">
            <div class="muted" style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Frozen Summary</div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <span class="chip chip-green">Archived</span>
              <span class="chip">Regs: ${registrationCount}</span>
              <span class="chip">Races: ${counts.total}</span>
              <span class="chip">Closed: ${counts.closed}</span>
              <span class="chip">Inline: ${counts.inline}</span>
              <span class="chip chip-orange">Open: ${counts.open}</span>
              <span class="chip chip-purple">Quad: ${counts.quad}</span>
              ${counts.timeTrials ? `<span class="chip">TT: ${counts.timeTrials}</span>` : ''}
              ${counts.relays ? `<span class="chip">Relays: ${counts.relays}</span>` : ''}
              ${counts.skateability ? `<span class="chip">Skatability: ${counts.skateability}</span>` : ''}
              ${counts.special ? `<span class="chip">Special: ${counts.special}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="action-row">
          <a class="btn2" href="/portal/meet/${meet.id}/results">View Results</a>
          ${canEditMeet(user, meet) ? `
            <a class="btn2" href="/portal/meet/${meet.id}/clone-confirm">Clone Setup</a>
            <form method="POST" action="/portal/meet/${meet.id}/unarchive" style="display:inline">
              <button class="btn2" type="submit" onclick="return confirm('Unarchive this meet and return it to the active portal list?')">Unarchive</button>
            </form>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="page-header">
      <h1>Archived Meets (${archived.length})</h1>
      <div class="sub">Historical meets preserved for results, future cloning, and SSL profile history.</div>
    </div>
    <div class="action-row" style="margin-bottom:16px"><a class="btn2" href="/portal">← Portal</a></div>
    ${cards || `<div class="card"><div class="muted">No archived meets yet.</div></div>`}`;
}

module.exports = {
  renderArchivedMeetsView,
};
