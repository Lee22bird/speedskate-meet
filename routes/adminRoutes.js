const express = require('express');
const { esc } = require('../utils/html');
const { nowIso } = require('../utils/date');
const { canEditMeet, canArchiveMeet, canDeleteMeet } = require('../utils/auth');
const { sendSms } = require('../services/sms');
const { postSsmUserMirrorToSsl } = require('../services/ssoService');
const { createBackup: createDesktopBackup } = require('../services/desktopBackupService');
const {
  getMeetOr404, meetRinkLabel, meetDateLabel, nextId,
  isArchivedMeet, cloneMeetSetup, defaultMeet, ensureAtLeastOneBlock, applyMeetOwner,
} = require('../services/meetHelpers');

module.exports = function createAdminRoutes(deps = {}) {
  const router = express.Router();
  const { requireRole, pageShell, saveDb,
          renderArchivedMeetsView, renderPendingMeetsView,
          renderPendingRinksView, renderStaffAccountsView,
          ADMIN_PHONE, TEAM_LIST = [], nextSetupPresetId,
          archivedMeetsForUser, sanitizeRinks } = deps;

  function nextUserId(db) {
    return (db.users || []).reduce((max, user) => Math.max(max, Number(user.id) || 0), 0) + 1;
  }

  function auditMeetEvent(db, meet, user, action, details = {}) {
    if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
    db.auditLogs.push({
      id: 'audit_' + Date.now() + '_' + Math.random().toString(16).slice(2),
      at: nowIso(),
      action,
      meetId: meet?.id || null,
      meetName: meet?.meetName || '',
      userId: user?.id || null,
      userName: user?.displayName || user?.username || '',
      details,
    });
  }

  function createDesktopBackupIfActive(db, reason) {
    if (process.env.SSM_DESKTOP !== '1') return;
    try { createDesktopBackup({ db, reason }); }
    catch (err) { console.warn(`Desktop backup skipped (${reason}):`, err.message); }
  }

  async function syncUserMirrorBestEffort(db, user, label) {
    try {
      const result = await postSsmUserMirrorToSsl(user);
      if (result?.skipped) {
        user.sslMirrorSyncStatus = 'skipped';
        user.sslMirrorSyncError = result.reason || 'Skipped by SSL mirror receiver.';
        user.sslMirrorSyncResponse = { skipped: true, reason: result.reason || '' };
      } else {
        user.sslMirrorSyncStatus = result?.user?.ssl_user_id || result?.user?.ssl_skater_id ? 'ok_linked' : 'ok_unlinked';
        user.sslMirrorSyncedAt = nowIso();
        user.sslMirrorSyncError = '';
        user.sslMirrorSyncResponse = result?.user?.id ? { id: result.user.id } : { ok: true };
      }
    } catch (err) {
      user.sslMirrorSyncStatus = 'failed';
      user.sslMirrorSyncAttemptedAt = nowIso();
      user.sslMirrorSyncError = String(err.message || err);
      console.warn(`SSL user mirror sync failed (${label}):`, err.message);
    }
    saveDb(db);
  }

  async function syncAllUserMirrors(db) {
    const users = Array.isArray(db.users) ? db.users : [];
    const failures = [];
    let syncedLinked = 0;
    let syncedUnlinked = 0;
    let skipped = 0;

    for (const user of users) {
      if (!user || user.id == null) {
        skipped += 1;
        continue;
      }
      try {
        const result = await postSsmUserMirrorToSsl(user);
        if (result?.skipped) {
          skipped += 1;
          user.sslMirrorSyncStatus = 'skipped';
          user.sslMirrorSyncAttemptedAt = nowIso();
          user.sslMirrorSyncError = result.reason || 'Skipped by SSL mirror receiver.';
          user.sslMirrorSyncResponse = { skipped: true, reason: result.reason || '' };
          continue;
        }
        const linked = !!(result?.user?.ssl_user_id || result?.user?.ssl_skater_id);
        if (linked) syncedLinked += 1;
        else syncedUnlinked += 1;
        user.sslMirrorSyncStatus = linked ? 'ok_linked' : 'ok_unlinked';
        user.sslMirrorSyncedAt = nowIso();
        user.sslMirrorSyncError = '';
        user.sslMirrorSyncResponse = result?.user?.id ? { id: result.user.id } : { ok: true };
      } catch (err) {
        user.sslMirrorSyncStatus = 'failed';
        user.sslMirrorSyncAttemptedAt = nowIso();
        user.sslMirrorSyncError = String(err.message || err);
        failures.push({
          ssm_user_id: String(user.id || ''),
          name: String(user.displayName || user.name || user.username || user.email || ''),
          email: String(user.email || ''),
          error: String(err.message || err),
        });
        console.warn('SSL user mirror sync failed (admin bulk sync):', user.id, err.message);
      }
    }

    saveDb(db);
    return {
      ok: failures.length === 0,
      total_users: users.length,
      synced: syncedLinked + syncedUnlinked,
      synced_linked: syncedLinked,
      synced_unlinked: syncedUnlinked,
      skipped,
      failed: failures.length,
      synced_count: syncedLinked + syncedUnlinked,
      skipped_count: skipped,
      failed_count: failures.length,
      failures,
    };
  }

  function userDisplayName(user) {
    return String(user?.displayName || user?.name || user?.username || user?.email || ('User ' + (user?.id || ''))).trim();
  }

  function idMatches(value, targetId) {
    if (value == null || value === '') return false;
    return String(value) === String(targetId) || Number(value) === Number(targetId);
  }

  function addReference(refs, type, label, path, recordId) {
    refs.push({
      type,
      label,
      path,
      record_id: recordId == null ? '' : String(recordId),
    });
  }

  function collectExplicitUserReferences(db, targetId) {
    const refs = [];
    const meets = Array.isArray(db.meets) ? db.meets : [];
    for (const meet of meets) {
      const meetId = meet?.id || '';
      const meetName = meet?.meetName || meet?.name || meet?.title || meetId || 'Meet';
      [
        ['meet_owner_user_id', 'meet ownership'],
        ['createdByUserId', 'meet created by'],
        ['created_by_user_id', 'meet created by'],
        ['ownershipAssignedByUserId', 'ownership assigned by'],
        ['archivedByUserId', 'meet archived by'],
        ['deletedByUserId', 'meet deleted by'],
      ].forEach(([field, label]) => {
        if (idMatches(meet?.[field], targetId)) addReference(refs, 'meet', `${label}: ${meetName}`, `meets.${meetId}.${field}`, meetId);
      });

      const staffRows = []
        .concat(Array.isArray(meet?.meet_staff_assignments) ? meet.meet_staff_assignments : [])
        .concat(Array.isArray(meet?.staffAssignments) ? meet.staffAssignments : []);
      staffRows.forEach((row, index) => {
        ['user_id', 'userId', 'ssm_user_id', 'ssmUserId', 'staff_user_id', 'assigned_by_user_id', 'assignedByUserId'].forEach(field => {
          if (idMatches(row?.[field], targetId)) {
            addReference(refs, 'staff_assignment', `staff assignment on ${meetName}`, `meets.${meetId}.staff.${index}.${field}`, row?.id || meetId);
          }
        });
      });
    }

    (Array.isArray(db.sessions) ? db.sessions : []).forEach((session, index) => {
      if (idMatches(session?.userId || session?.user_id, targetId)) {
        addReference(refs, 'session', 'active or stored session', `sessions.${index}.userId`, session?.token || index);
      }
    });

    (Array.isArray(db.ssm_user_mirrors) ? db.ssm_user_mirrors : []).forEach((mirror, index) => {
      if (idMatches(mirror?.ssm_user_id || mirror?.ssmUserId || mirror?.user_id || mirror?.userId, targetId)) {
        addReference(refs, 'ssm_user_mirror', 'local SSM user mirror row', `ssm_user_mirrors.${index}`, mirror?.id || index);
      }
    });

    (Array.isArray(db.auditLogs) ? db.auditLogs : []).forEach((row, index) => {
      ['userId', 'user_id', 'adminUserId', 'admin_user_id', 'createdByUserId', 'deletedByUserId'].forEach(field => {
        if (idMatches(row?.[field], targetId)) addReference(refs, 'audit', 'admin/audit record', `auditLogs.${index}.${field}`, row?.id || index);
      });
    });

    return refs;
  }

  function collectRecursiveUserReferences(db, targetId) {
    const refs = [];
    const seen = new Set();
    const userIdKey = /(^|_)(user_id|userId|createdByUserId|created_by_user_id|deletedByUserId|archivedByUserId|assignedByUserId|assigned_by_user_id|ownerUserId|owner_user_id|ssm_user_id|ssmUserId)$/;
    const skipTop = new Set(['users']);

    function walk(value, pathParts) {
      if (!value || typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);
      if (pathParts.length === 1 && skipTop.has(pathParts[0])) return;

      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, pathParts.concat(String(index))));
        return;
      }

      for (const [key, child] of Object.entries(value)) {
        const childPath = pathParts.concat(key);
        if (userIdKey.test(key) && idMatches(child, targetId)) {
          addReference(refs, pathParts[0] || 'record', 'user reference', childPath.join('.'), value.id || '');
        }
        if (child && typeof child === 'object') walk(child, childPath);
      }
    }

    walk(db, []);
    return refs;
  }

  function dedupeReferences(refs) {
    const seen = new Set();
    return refs.filter(ref => {
      const key = `${ref.type}|${ref.path}|${ref.record_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function userDeleteReferences(db, targetId) {
    return dedupeReferences([
      ...collectExplicitUserReferences(db, targetId),
      ...collectRecursiveUserReferences(db, targetId),
    ]);
  }

  function disableLegacyUser(db, target, actor, reason) {
    target.active = false;
    target.disabledAt = nowIso();
    target.disabledByUserId = actor?.id || null;
    target.disabledBy = userDisplayName(actor);
    target.disabledReason = reason || 'Disabled by Super Admin.';
    target.migratedAt = target.migratedAt || nowIso();
    target.migratedByUserId = target.migratedByUserId || actor?.id || null;
    target.migratedBy = target.migratedBy || userDisplayName(actor);
    target.migrationStatus = 'disabled_legacy_login';
    target.updatedAt = nowIso();
    db.sessions = (db.sessions || []).filter(s => !idMatches(s.userId || s.user_id, target.id));
    return target;
  }

  function activeSuperAdminCount(users) {
    return (users || []).filter(u =>
      u.active !== false &&
      Array.isArray(u.roles) &&
      u.roles.includes('super_admin')
    ).length;
  }

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
  if(!meet||!canArchiveMeet(req.user,meet)) return res.redirect('/portal');
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
  if(!meet||!canArchiveMeet(req.user,meet)) {
    if (meet) { auditMeetEvent(req.db, meet, req.user, 'archive_denied'); saveDb(req.db); }
    return res.redirect('/portal');
  }
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
  if(!meet||!canArchiveMeet(req.user,meet)) return res.redirect('/portal');
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
          It copies divisions, distances, pricing, rink setup, Open/Quad setup, Additional Race setup, and block names.
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
  const clone=cloneMeetSetup(source, nextId(req.db.meets), req.user);
  req.db.meets.push(clone);
  saveDb(req.db);
  res.redirect(`/portal/meet/${clone.id}/builder`);
});

// ── Meet CRUD ─────────────────────────────────────────────────────────────────

router.post('/portal/create-meet', requireRole('meet_director'), (req, res) => {
  const meet=defaultMeet(req.user); meet.id=nextId(req.db.meets);
  req.db.meets.push(meet); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/builder`);
});

router.get('/portal/meet/:meetId/delete-confirm', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canDeleteMeet(req.user,meet)) return res.redirect('/portal');
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
  if(!meet||!canDeleteMeet(req.user,meet)) {
    if (meet) { auditMeetEvent(req.db, meet, req.user, 'delete_denied'); saveDb(req.db); }
    return res.redirect('/portal');
  }
  createDesktopBackupIfActive(req.db, 'before_meet_delete');
  req.db.meets=req.db.meets.filter(m=>Number(m.id)!==Number(req.params.meetId));
  saveDb(req.db); res.redirect('/portal');
});

router.post('/portal/meet/:meetId/ownership', requireRole('super_admin'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  const owner=(req.db.users||[]).find(u=>Number(u.id)===Number(req.body.ownerUserId));
  if(!owner) return res.redirect(`/portal/meet/${meet.id}/builder?error=${encodeURIComponent('Owner not found.')}`);
  const previous = {
    meet_owner_user_id: meet.meet_owner_user_id,
    meet_owner_ssl_id: meet.meet_owner_ssl_id,
    meet_owner_name: meet.meet_owner_name,
  };
  applyMeetOwner(meet, owner);
  meet.ownershipAssignedAt = nowIso();
  meet.ownershipAssignedByUserId = req.user.id;
  meet.updatedAt = nowIso();
  auditMeetEvent(req.db, meet, req.user, previous.meet_owner_user_id ? 'ownership_changed' : 'ownership_assigned', {
    previous,
    next: {
      meet_owner_user_id: meet.meet_owner_user_id,
      meet_owner_ssl_id: meet.meet_owner_ssl_id,
      meet_owner_name: meet.meet_owner_name,
    },
  });
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder?ownership=1`);
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
      ok: req.query.ok ? decodeURIComponent(String(req.query.ok)) : '',
    }),
  }));
});

router.post('/portal/users/new', requireRole('super_admin'), async (req, res) => {
  const rolesRaw=req.body.roles; const roles=Array.isArray(rolesRaw)?rolesRaw:(rolesRaw?[rolesRaw]:[]);
  const email=String(req.body.email||req.body.username||'').trim().toLowerCase();
  const user = {
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
  };
  req.db.users.push(user);
  saveDb(req.db);
  await syncUserMirrorBestEffort(req.db, user, 'admin create user');
  res.redirect('/portal/users');
});

router.post('/portal/users/:userId/update', requireRole('super_admin'), async (req, res) => {
  const user=(req.db.users||[]).find(u=>Number(u.id)===Number(req.params.userId));
  if(!user) return res.redirect('/portal/users');
  const rolesRaw=req.body.roles; const roles=Array.isArray(rolesRaw)?rolesRaw:(rolesRaw?[rolesRaw]:[]);
  user.roles=roles;
  user.team=String(req.body.team||'').trim();
  user.active=String(req.body.active||'true')==='true';
  if (roles.length && user.requestedRole && !user.requestedRoleResolvedAt) {
    user.requestedRoleResolvedAt = nowIso();
  }
  user.updatedAt=nowIso();
  saveDb(req.db);
  await syncUserMirrorBestEffort(req.db, user, 'admin update user');
  res.redirect('/portal/users');
});

async function disableUserHandler(req, res) {
  const targetId = Number(req.params.userId);
  const users = req.db.users || [];
  const target = users.find(u => Number(u.id) === targetId);

  if (!target) return res.redirect('/portal/users?err=' + encodeURIComponent('User not found.'));

  if (Number(req.user?.id) === targetId) {
    return res.redirect('/portal/users?err=' + encodeURIComponent('You cannot disable the account you are currently logged in as.'));
  }

  const targetIsSuperAdmin = Array.isArray(target.roles) && target.roles.includes('super_admin');
  if (targetIsSuperAdmin && activeSuperAdminCount(users) <= 1) {
    return res.redirect('/portal/users?err=' + encodeURIComponent('You cannot disable the last active Super Admin account.'));
  }

  const references = userDeleteReferences(req.db, targetId);
  const reason = String(req.body.reason || '').trim()
    || (references.length ? `Disabled instead of deleted because ${references.length} reference(s) exist.` : 'Disabled by Super Admin.');
  disableLegacyUser(req.db, target, req.user, reason);
  saveDb(req.db);
  await syncUserMirrorBestEffort(req.db, target, 'admin disable user');
  return res.redirect('/portal/users?ok=' + encodeURIComponent(`Disabled ${userDisplayName(target)}.`));
}

async function deleteUserHandler(req, res) {
  const targetId = Number(req.params.userId);
  const users = req.db.users || [];
  const target = users.find(u => Number(u.id) === targetId);

  if (!target) return res.redirect('/portal/users?err=' + encodeURIComponent('User not found.'));

  if (Number(req.user?.id) === targetId) {
    return res.redirect('/portal/users?err=' + encodeURIComponent('You cannot delete the account you are currently logged in as.'));
  }

  const targetIsSuperAdmin = Array.isArray(target.roles) && target.roles.includes('super_admin');
  if (targetIsSuperAdmin && activeSuperAdminCount(users) <= 1) {
    return res.redirect('/portal/users?err=' + encodeURIComponent('You cannot delete the last active Super Admin account.'));
  }

  const references = userDeleteReferences(req.db, targetId);
  if (references.length) {
    const reason = `Hard delete blocked: ${references.length} reference(s) exist. ` +
      references.slice(0, 6).map(ref => ref.label || ref.path).join('; ') +
      (references.length > 6 ? '; plus more' : '');
    disableLegacyUser(req.db, target, req.user, reason);
    saveDb(req.db);
    await syncUserMirrorBestEffort(req.db, target, 'admin delete blocked; disabled user');
    return res.redirect('/portal/users?err=' + encodeURIComponent(`${userDisplayName(target)} was disabled instead of deleted. ${reason}`));
  }

  req.db.users = users.filter(u => Number(u.id) !== targetId);
  req.db.sessions = (req.db.sessions || []).filter(s => !idMatches(s.userId || s.user_id, targetId));
  saveDb(req.db);

  const mirrorUser = Object.assign({}, target, {
    active: false,
    disabledAt: nowIso(),
    disabledReason: 'Deleted from SSM local users by Super Admin after safety scan found no references.',
    migrationStatus: 'deleted_legacy_login',
  });
  await syncUserMirrorBestEffort(req.db, mirrorUser, 'admin delete user');

  return res.redirect('/portal/users?ok=' + encodeURIComponent(`Deleted ${userDisplayName(target)}. No local references were found.`));
}

router.post('/admin/tools/sync-ssl-user-mirrors', requireRole('super_admin'), async (req, res) => {
  createDesktopBackupIfActive(req.db, 'before_sync');
  const summary = await syncAllUserMirrors(req.db);
  res.status(summary.failed ? 207 : 200).json(summary);
});

router.post('/admin/users/:userId/disable', requireRole('super_admin'), disableUserHandler);
router.post('/portal/users/:userId/disable', requireRole('super_admin'), disableUserHandler);
router.post('/admin/users/:userId/delete', requireRole('super_admin'), deleteUserHandler);
router.post('/portal/users/:userId/delete', requireRole('super_admin'), deleteUserHandler);

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
