const { esc } = require('../utils/html');
const { hasRole, canEditMeet } = require('../utils/auth');

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

function renderPortalMeetCard({ db, user, meet }) {
  const openCount = (meet.openGroups || []).filter(g => g.enabled).length;
  const quadCount = (meet.quadGroups || []).filter(g => g.enabled).length;
  const inlineCount = (meet.races || []).filter(r => !r.isOpenRace && !r.isQuadRace).length;
  const statusClass = meet.status === 'live' ? 'green' : meet.status === 'complete' ? 'sky' : 'orange';
  const rinkLabel = meetRinkLabel(db, meet);

  return `
    <div class="card" style="margin-bottom:14px">
      <div class="row between" style="margin-bottom:12px">
        <div>
          <h2 style="margin:0">${esc(meet.meetName)}</h2>
          <div class="muted" style="font-size:13px">${rinkLabel ? `${esc(rinkLabel)} • ` : ``}${esc(meetDateLabel(meet) || 'Date TBD')} • <span class="chip chip-${statusClass}" style="font-size:11px">${esc(meet.status || 'draft')}</span></div>
        </div>
        <div class="row">
          <span class="chip">Inline: ${inlineCount}</span>
          <span class="chip chip-orange">Open: ${openCount}</span>
          <span class="chip chip-purple">Quad: ${quadCount}</span>
          <span class="chip">Regs: ${(meet.registrations || []).length}</span>
        </div>
      </div>
      ${canEditMeet(user, meet) ? `
        <div class="meet-action-groups" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px">
          <div class="mini-card" style="padding:12px;border:1px solid var(--border);border-radius:14px;background:#f8fafc">
            <div class="muted" style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Setup</div>
            <div class="action-row">
              <a class="btn" href="/portal/meet/${meet.id}/builder">Meet Builder</a>
              <a class="btn-orange" href="/portal/meet/${meet.id}/open-builder">🏁 Open</a>
              <a class="btn-purple" href="/portal/meet/${meet.id}/quad-builder">🛼 Quad</a>
            </div>
          </div>
          <div class="mini-card" style="padding:12px;border:1px solid var(--border);border-radius:14px;background:#f8fafc">
            <div class="muted" style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Race Ops</div>
            <div class="action-row">
              <a class="btn2" href="/portal/meet/${meet.id}/race-day/director">Race Day</a>
              <a class="btn2" href="/portal/meet/${meet.id}/results">Results</a>
            </div>
          </div>
          <div class="mini-card" style="padding:12px;border:1px solid var(--border);border-radius:14px;background:#f8fafc">
            <div class="muted" style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Manage</div>
            <div class="action-row">
              <a class="btn2 btn-sm" href="/portal/meet/${meet.id}/clone-confirm">Clone</a>
              <a class="btn2 btn-sm" href="/portal/meet/${meet.id}/archive-confirm">📦 Archive</a>
              <a class="btn-danger btn-sm" href="/portal/meet/${meet.id}/delete-confirm">Delete</a>
            </div>
          </div>
        </div>
      ` : `<div class="action-row"><a class="btn2" href="/portal/meet/${meet.id}/coach">Coach Panel</a>
           <a class="btn2" href="/meet/${meet.id}/live">Live</a></div>`}
    </div>`;
}

function renderPortalHome({ db, user, visibleMeets }) {
  const cards = (visibleMeets || [])
    .map(meet => renderPortalMeetCard({ db, user, meet }))
    .join('');

  const pendingRinkCount = (db.pendingRinks || [])
    .filter(p => String(p.status || 'pending') === 'pending')
    .length;

  const pendingMeetCount = (db.pendingMeets || [])
    .filter(p => String(p.status || 'pending') === 'pending')
    .length;

  return `
    <div class="page-header">
      <h1>Director Portal</h1>
      <div class="sub">Welcome back, ${esc(user.displayName || user.username)}.</div>
    </div>
    <div class="action-row" style="margin-bottom:20px">
      ${hasRole(user, 'super_admin') || hasRole(user, 'meet_director') ? `
        <form method="POST" action="/portal/create-meet"><button class="btn-orange" type="submit">+ New Meet</button></form>
        <a class="btn2" href="/portal/rinks">Manage Rinks</a>
        <a class="btn2" href="/portal/archived-meets">Archived Meets</a>` : ''}
      ${hasRole(user, 'coach') || hasRole(user, 'super_admin') || hasRole(user, 'meet_director') ? `<a class="btn2" href="/portal/coach">Coach Portal</a>` : ''}
      ${hasRole(user, 'super_admin') ? `<a class="btn2" href="/portal/users">Users</a>
        <a class="btn2" href="/portal/pending-rinks" style="position:relative">Pending Rinks${pendingRinkCount ? `<span style="position:absolute;top:-6px;right:-6px;background:var(--red);color:#fff;border-radius:50%;width:18px;height:18px;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:700">${pendingRinkCount}</span>` : ''}
        </a>
        <a class="btn2" href="/portal/pending-meets" style="position:relative">Pending Meets${pendingMeetCount ? `<span style="position:absolute;top:-6px;right:-6px;background:var(--red);color:#fff;border-radius:50%;width:18px;height:18px;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:700">${pendingMeetCount}</span>` : ''}</a>` : ''}
    </div>
    ${cards || `<div class="card"><div class="muted">No meets yet. Click "New Meet" to get started.</div></div>`}`;
}

module.exports = {
  renderPortalHome,
};
