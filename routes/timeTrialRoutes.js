const express = require('express');
const { esc } = require('../utils/html');
const { canEditMeet } = require('../utils/auth');
const { getMeetOr404 } = require('../services/meetHelpers');
const {
  timeTrialEventForMeet,
  timeTrialEventTitle,
  timeTrialResults,
  timeTrialStats,
  saveTimeTrialTime,
} = require('../services/timeTrialEvents');
const { skaterAvatarHtml } = require('../services/avatarDisplay');

function leaderboardColumn(title, rows) {
  return `
    <div class="card">
      <h2 style="margin-top:0">${esc(title)}</h2>
      <table class="table">
        <tbody>${rows.map(row => `
          <tr><td style="width:36px">${row.rank}</td><td><div style="display:flex;align-items:center;gap:10px">${skaterAvatarHtml(row, {}, 'small')}<div><strong>${esc(row.skater)}</strong><div class="muted" style="font-size:12px">${esc(row.team || '')}</div></div></div></td><td>${esc(row.time)}</td></tr>
        `).join('') || '<tr><td class="muted">No times yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function queueHtml(event) {
  const currentIndex = Number(event.currentIndex || 0);
  return (event.participants || []).map((row, index) => {
    const done = String(row.time || '').trim();
    const marker = done ? '✓' : (index === currentIndex ? '▶' : '○');
    const cls = done ? 'good' : (index === currentIndex ? 'bold' : 'muted');
    return `<div class="${cls}" style="padding:6px 0;border-bottom:1px solid rgba(0,0,0,.06);display:flex;align-items:center;gap:10px"><span style="width:18px">${marker}</span>${skaterAvatarHtml(row, {}, 'small')}<span>${esc(row.skater)}${done ? ` <span class="muted">(${esc(row.time)})</span>` : ''}</span></div>`;
  }).join('');
}

module.exports = function createTimeTrialRoutes(deps = {}) {
  const router = express.Router();
  const { requireRole, pageShell, saveDb } = deps;

  router.get('/portal/meet/:meetId/time-trials/:eventId', requireRole('meet_director','judge','coach','super_admin'), (req, res) => {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet) return res.redirect('/portal');
    const event = timeTrialEventForMeet(meet, req.params.eventId);
    if (!event) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/blocks`);
    const canManage = canEditMeet(req.user, meet);
    const stats = timeTrialStats(event);
    const current = event.participants[Number(event.currentIndex || 0)] || event.participants.find(row => !String(row.time || '').trim()) || event.participants[0] || null;
    const results = timeTrialResults(event);
    res.send(pageShell({ title: 'Time Trial Event', user: req.user, bodyHtml: `
      <div class="page-header"><h1>Time Trial Event</h1><div class="sub">${esc(meet.meetName)} • Distance: ${esc(event.distance || '100m')}</div></div>
      <div class="action-row" style="margin-bottom:14px"><a class="btn2" href="/portal/meet/${esc(meet.id)}/blocks">Back to Block Builder</a><a class="btn2" href="/portal/meet/${esc(meet.id)}/time-trials/${esc(event.id)}/export.csv">Export CSV</a></div>
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card navy"><div class="stat-label">Distance</div><div class="stat-value">${esc(event.distance || '100m')}</div></div>
        <div class="stat-card green"><div class="stat-label">Completed</div><div class="stat-value">${stats.completed}</div></div>
        <div class="stat-card orange"><div class="stat-label">Remaining</div><div class="stat-value">${stats.remaining}</div></div>
      </div>
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card">
          <h2 style="margin-top:0">Current Skater</h2>
          ${current ? `
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
              ${skaterAvatarHtml(current, {}, '')}
              <div>
                <div style="font-size:34px;font-weight:900;color:var(--navy);line-height:1.05">${esc(current.skater)}</div>
                <div class="muted" style="margin-top:6px">Team: ${esc(current.team || '')}</div>
              </div>
            </div>
            ${canManage ? `
              <form method="POST" action="/portal/meet/${esc(meet.id)}/time-trials/${esc(event.id)}/time" class="stack">
                <input type="hidden" name="registrationId" value="${esc(current.registrationId)}" />
                <div><label>Time Entry</label><input name="time" value="${esc(current.time || '')}" placeholder="10.42" autocomplete="off" required /></div>
                <div class="action-row">
                  <button class="btn2" type="submit" name="action" value="save">Save Time</button>
                  <button class="btn-orange" type="submit" name="action" value="save_next">Save & Next</button>
                </div>
              </form>
              <div class="action-row" style="margin-top:12px">
                <form method="POST" action="/portal/meet/${esc(meet.id)}/time-trials/${esc(event.id)}/step"><button class="btn2" name="direction" value="-1">Previous Skater</button></form>
                <form method="POST" action="/portal/meet/${esc(meet.id)}/time-trials/${esc(event.id)}/step"><button class="btn2" name="direction" value="1">Next Skater</button></form>
              </div>` : ''}
          ` : '<div class="muted">No participants yet.</div>'}
        </div>
        <div class="card"><h2 style="margin-top:0">Queue</h2>${queueHtml(event) || '<div class="muted">No registered skaters.</div>'}</div>
      </div>
      <div class="grid-3">
        ${leaderboardColumn('Fastest Male', results.male)}
        ${leaderboardColumn('Fastest Female', results.female)}
        ${leaderboardColumn('Overall', results.overall)}
      </div>
      <script>setTimeout(function(){ location.reload(); }, 10000);</script>
    ` }));
  });

  router.post('/portal/meet/:meetId/time-trials/:eventId/time', requireRole('meet_director','super_admin'), (req, res) => {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
    const event = timeTrialEventForMeet(meet, req.params.eventId);
    if (!event) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/blocks`);
    try {
      saveTimeTrialTime(event, req.body.registrationId, req.body.time, req.user.id);
      saveDb(req.db);
    } catch (err) {
      return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/time-trials/${encodeURIComponent(event.id)}?error=${encodeURIComponent(err.message)}`);
    }
    return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/time-trials/${encodeURIComponent(event.id)}`);
  });

  router.post('/portal/meet/:meetId/time-trials/:eventId/step', requireRole('meet_director','super_admin'), (req, res) => {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
    const event = timeTrialEventForMeet(meet, req.params.eventId);
    if (event) {
      const dir = Number(req.body.direction || 0);
      event.currentIndex = Math.min(Math.max(0, Number(event.currentIndex || 0) + dir), Math.max(0, (event.participants || []).length - 1));
      saveDb(req.db);
    }
    return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/time-trials/${encodeURIComponent(req.params.eventId)}`);
  });

  router.get('/portal/meet/:meetId/time-trials/:eventId/export.csv', requireRole('meet_director','coach','super_admin'), (req, res) => {
    const meet = getMeetOr404(req.db, req.params.meetId);
    const event = meet ? timeTrialEventForMeet(meet, req.params.eventId) : null;
    if (!event) return res.status(404).send('Not found');
    const results = timeTrialResults(event).overall;
    const rows = [['Rank','Skater','Team','Gender','Time'], ...results.map(row => [row.rank, row.skater, row.team, row.gender, row.time])];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="time-trial-${event.id}.csv"`);
    res.send(rows.map(row => row.map(value => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`).join(',')).join('\n'));
  });

  return router;
};
