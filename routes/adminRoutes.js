const express = require('express');
const { esc } = require('../utils/html');
const { nowIso } = require('../utils/date');
const { canEditMeet } = require('../utils/auth');
const { sendSms } = require('../services/sms');
const {
  getMeetOr404, meetRinkLabel, meetDateLabel, nextId,
  isArchivedMeet, cloneMeetSetup, defaultMeet, ensureAtLeastOneBlock,
} = require('../services/meetHelpers');

module.exports = function createAdminRoutes(deps = {}) {
  const router = express.Router();
  const { requireRole, pageShell, saveDb,
          renderArchivedMeetsView, renderPendingMeetsView,
          renderPendingRinksView, renderStaffAccountsView,
          ADMIN_PHONE, rinkForm, nextSetupPresetId,
          archivedMeetsForUser } = deps;

router.get('/portal/archived-meets', requireRole('meet_director','coach','super_admin'), (req, res) => {
  const archived = archivedMeetsForUser(req.db, req.user)
    .sort((a, b) => new Date(b.archivedAt || b.updatedAt || 0) - new Date(a.archivedAt || a.updatedAt || 0));

  res.send(pageShell({
    title: 'Archived Meets',
    user: req.user,
    bodyHtml: renderArchivedMeetsView({ db: req.db, user: req.user, archived }),
  }));
});

router.get('/portal/meet/:meetId/archive-confirm', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  res.send(pageShell({title:'Archive Meet',user:req.user, bodyHtml:`
    <div style="max-width:620px;margin:40px auto">
      <div class="page-header"><h1>Archive Meet</h1><div class="sub">${esc(meet.meetName)}</div></div>
      <div class="card">
        <div class="good" style="margin-bottom:12px">Archiving hides this meet from the active portal list and freezes it as historical meet data.</div>
        <div class="muted" style="line-height:1.7;margin-bottom:16px">
          It does not delete registrations, races, results, standings, blocks, or race assignments. You can unarchive it later if you need to fix something.
        </div>
        <div class="hr"></div>
        <form method="POST" action="/portal/meet/${meet.id}/archive" class="action-row">
          <button class="btn-orange" type="submit">Archive Meet</button>
          <a class="btn2" href="/portal/meet/${meet.id}/results">Cancel</a>
        </form>
      </div>
    </div>`}));
});

router.post('/portal/meet/:meetId/archive', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  meet.previousStatus = meet.previousStatus || meet.status || 'complete';
  meet.status = 'archived';
  meet.archivedAt = nowIso();
  meet.archivedByUserId = req.user.id;
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect('/portal/archived-meets');
});

router.post('/portal/meet/:meetId/unarchive', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  meet.status = meet.previousStatus && meet.previousStatus !== 'archived' ? meet.previousStatus : 'complete';
  meet.archivedAt = '';
  meet.archivedByUserId = null;
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect('/portal');
});

// ── Meet Clone ─────────────────────────────────────────────────────────────────

router.get('/portal/meet/:meetId/clone-confirm', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  res.send(pageShell({title:'Clone Meet Setup',user:req.user, bodyHtml:`
    <div style="max-width:680px;margin:40px auto">
      <div class="page-header"><h1>Clone Meet Setup</h1><div class="sub">${esc(meet.meetName)}</div></div>
      <div class="card">
        <div class="good" style="margin-bottom:12px">This creates a new draft meet using this meet's setup.</div>
        <div class="muted" style="line-height:1.7;margin-bottom:16px">
          It copies divisions, distances, pricing, rink setup, Open/Quad setup, Skatability/Special Race setup, and block names.
          It does not copy registrations, race results, check-ins, paid status, text alerts, or current race-day state.
        </div>
        <div class="hr"></div>
        <form method="POST" action="/portal/meet/${meet.id}/clone" class="action-row">
          <button class="btn-orange" type="submit">Create Draft Clone</button>
          <a class="btn2" href="${isArchivedMeet(meet) ? '/portal/archived-meets' : '/portal'}">Cancel</a>
        </form>
      </div>
    </div>`}));
});

router.post('/portal/meet/:meetId/clone', requireRole('meet_director'), (req, res) => {
  const source=getMeetOr404(req.db,req.params.meetId);
  if(!source||!canEditMeet(req.user,source)) return res.redirect('/portal');
  const clone=cloneMeetSetup(source, nextId(req.db.meets), req.user.id);
  req.db.meets.push(clone);
  saveDb(req.db);
  res.redirect(`/portal/meet/${clone.id}/builder`);
});

// ── Meet CRUD ─────────────────────────────────────────────────────────────────

router.post('/portal/create-meet', requireRole('meet_director'), (req, res) => {
  const meet=defaultMeet(req.user.id); meet.id=nextId(req.db.meets);
  req.db.meets.push(meet); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/builder`);
});

router.get('/portal/meet/:meetId/delete-confirm', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  res.send(pageShell({title:'Delete Meet',user:req.user, bodyHtml:`
    <div style="max-width:500px;margin:40px auto">
      <div class="page-header"><h1>Delete Meet</h1></div>
      <div class="card">
        <div class="danger" style="margin-bottom:12px">This permanently deletes the meet, all races, blocks, and registrations.</div>
        <h2>${esc(meet.meetName)}</h2>
        <div class="hr"></div>
        <form method="POST" action="/portal/meet/${meet.id}/delete" class="action-row">
          <button class="btn-danger" type="submit">Yes, Delete Permanently</button>
          <a class="btn2" href="/portal">Cancel</a>
        </form>
      </div>
    </div>`}));
});

router.post('/portal/meet/:meetId/delete', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  req.db.meets=req.db.meets.filter(m=>Number(m.id)!==Number(req.params.meetId));
  saveDb(req.db); res.redirect('/portal');
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/portal/users', requireRole('super_admin'), (req, res) => {
  res.send(pageShell({
    title: 'Users',
    user: req.user,
    bodyHtml: renderStaffAccountsView({
      users: req.db.users || [],
      teamList: TEAM_LIST,
      currentUserId: req.user?.id,
      err: req.query.err ? decodeURIComponent(String(req.query.err)) : '',
    }),
  }));
});

router.post('/portal/users/new', requireRole('super_admin'), (req, res) => {
  const rolesRaw=req.body.roles; const roles=Array.isArray(rolesRaw)?rolesRaw:(rolesRaw?[rolesRaw]:[]);
  const email=String(req.body.email||req.body.username||'').trim().toLowerCase();
  req.db.users.push({
    id:nextUserId(req.db),
    displayName:String(req.body.displayName||'').trim(),
    username:email,
    email,
    password:String(req.body.password||'').trim(),
    team:String(req.body.team||'Midwest Racing').trim(),
    roles,
    active:true,
    authProvider:'local',
    createdAt:nowIso(),
    updatedAt:nowIso(),
  });
  saveDb(req.db); res.redirect('/portal/users');
});

router.post('/portal/users/:userId/update', requireRole('super_admin'), (req, res) => {
  const user=(req.db.users||[]).find(u=>Number(u.id)===Number(req.params.userId));
  if(!user) return res.redirect('/portal/users');
  const rolesRaw=req.body.roles; const roles=Array.isArray(rolesRaw)?rolesRaw:(rolesRaw?[rolesRaw]:[]);
  user.roles=roles;
  user.team=String(req.body.team||'').trim();
  user.active=String(req.body.active||'true')==='true';
  user.updatedAt=nowIso();
  saveDb(req.db); res.redirect('/portal/users');
});

router.post('/portal/users/:userId/delete', requireRole('super_admin'), (req, res) => {
  const targetId = Number(req.params.userId);
  const users = req.db.users || [];
  const target = users.find(u => Number(u.id) === targetId);

  if (!target) return res.redirect('/portal/users');

  if (Number(req.user?.id) === targetId) {
    return res.redirect('/portal/users?err=' + encodeURIComponent('You cannot delete the account you are currently logged in as.'));
  }

  const targetIsSuperAdmin = Array.isArray(target.roles) && target.roles.includes('super_admin');
  if (targetIsSuperAdmin) {
    const superAdminCount = users.filter(u =>
      u.active !== false &&
      Array.isArray(u.roles) &&
      u.roles.includes('super_admin')
    ).length;

    if (superAdminCount <= 1) {
      return res.redirect('/portal/users?err=' + encodeURIComponent('You cannot delete the last active Super Admin account.'));
    }
  }

  req.db.users = users.filter(u => Number(u.id) !== targetId);
  req.db.sessions = (req.db.sessions || []).filter(s => Number(s.userId) !== targetId);
  saveDb(req.db);

  res.redirect('/portal/users');
});

// ── Rinks ─────────────────────────────────────────────────────────────────────

function rinkForm(rink,action,title) {
  return `
    <div style="max-width:700px">
      <div class="page-header"><h1>${esc(title)}</h1></div>
      <div class="card">
        <form method="POST" action="${action}" class="stack">
          <div class="form-grid cols-2">
            <div><label>Name</label><input name="name" value="${esc(rink.name||'')}" required /></div>
            <div><label>Phone</label><input name="phone" value="${esc(rink.phone||'')}" /></div>
            <div><label>Address</label><input name="address" value="${esc(rink.address||'')}" /></div>
            <div><label>Website</label><input name="website" value="${esc(rink.website||'')}" /></div>
            <div><label>City</label><input name="city" value="${esc(rink.city||'')}" /></div>
            <div><label>State</label><input name="state" value="${esc(rink.state||'')}" /></div>
            <div><label>Team</label><input name="team" value="${esc(rink.team||'')}" /></div>
          </div>
          <div><label>Notes</label><textarea name="notes">${esc(rink.notes||'')}</textarea></div>
          <div class="action-row">
            <button class="btn" type="submit">Save Rink</button>
            <a class="btn2" href="/portal/rinks">Back</a>
          </div>
        </form>
      </div>
    </div>`;
}

router.get('/portal/rinks', requireRole('super_admin'), (req, res) => {
  const rows=req.db.rinks.map(r=>`
    <tr><td>${esc(r.name)}</td><td>${esc(r.city||'')}, ${esc(r.state||'')}</td>
    <td>${esc(r.phone||'')}</td><td><a class="btn2 btn-sm" href="/portal/rinks/${r.id}/edit">Edit</a></td></tr>`).join('');
  res.send(pageShell({title:'Rink Admin',user:req.user, bodyHtml:`
    <div class="page-header"><h1>Rink Admin</h1></div>
    <div class="card">
      <div class="row between" style="margin-bottom:14px"><h2 style="margin:0">Rinks</h2><a class="btn-orange" href="/portal/rinks/new">+ Add Rink</a></div>
      <table class="table"><thead><tr><th>Name</th><th>City/State</th><th>Phone</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>`}));
});

router.get('/portal/rinks/new', requireRole('meet_director'), (req, res) => {
  res.send(pageShell({title:'Add Rink',user:req.user, bodyHtml:rinkForm({},'portal/rinks/new','Add Rink')}));
});
router.post('/portal/rinks/new', requireRole('meet_director'), (req, res) => {
  req.db.rinks.push({id:nextId(req.db.rinks),name:String(req.body.name||'').trim(),phone:String(req.body.phone||'').trim(),address:String(req.body.address||'').trim(),website:String(req.body.website||'').trim(),city:String(req.body.city||'').trim(),state:String(req.body.state||'').trim(),team:String(req.body.team||'').trim(),notes:String(req.body.notes||'').trim()});
  sanitizeRinks(req.db); saveDb(req.db); res.redirect('/portal/rinks');
});
router.get('/portal/rinks/:id/edit', requireRole('meet_director'), (req, res) => {
  const rink=req.db.rinks.find(r=>Number(r.id)===Number(req.params.id));
  if(!rink) return res.redirect('/portal/rinks');
  res.send(pageShell({title:'Edit Rink',user:req.user, bodyHtml:rinkForm(rink,`/portal/rinks/${rink.id}/edit`,'Edit Rink')}));
});
router.post('/portal/rinks/:id/edit', requireRole('meet_director'), (req, res) => {
  const rink=req.db.rinks.find(r=>Number(r.id)===Number(req.params.id));
  if(!rink) return res.redirect('/portal/rinks');
  Object.assign(rink,{name:String(req.body.name||'').trim(),phone:String(req.body.phone||'').trim(),address:String(req.body.address||'').trim(),website:String(req.body.website||'').trim(),city:String(req.body.city||'').trim(),state:String(req.body.state||'').trim(),team:String(req.body.team||'').trim(),notes:String(req.body.notes||'').trim()});
  sanitizeRinks(req.db); saveDb(req.db); res.redirect('/portal/rinks');
});

  return router;
};
