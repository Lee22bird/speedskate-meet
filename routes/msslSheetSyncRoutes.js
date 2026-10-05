const express = require('express');
const { esc } = require('../utils/html');
const { canEditMeet } = require('../utils/auth');
const { getMeetOr404 } = require('../services/meetHelpers');
const { meetHasStartedRacing } = require('../services/regenGuard');
const { parseMsslSnapshot, planMsslSync, applyMsslSync } = require('../services/msslSheetSync');

module.exports = function createMsslSheetSyncRoutes({ requireRole, pageShell, saveDb } = {}) {
  const router = express.Router();

  function authorized(req, res) {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet || !canEditMeet(req.user, meet)) {
      res.redirect('/portal');
      return null;
    }
    return meet;
  }

  function entryForm(meet, message = '') {
    return `<div class="page-header"><h1>MSSL Sheet Sync</h1><div class="sub">${esc(meet.meetName)} · read-only source</div></div>
      ${message ? `<div class="notice">${esc(message)}</div>` : ''}
      <div class="card" style="max-width:900px">
        <p>Paste a copied team-tab range containing the headers and attendance columns. SSM uses helmet, name, Race Age, gender, category flags, and attendance only. DOB, current age, waiver, and unrelated columns are discarded before the preview confirmation.</p>
        <p><strong>This does not connect to or edit the MSSL workbook.</strong> Paste one team tab at a time. The source text is used for this preview only and is not stored.</p>
        <form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync/preview" class="stack">
          <div><label>Team name</label><input name="team" required maxlength="120" placeholder="Team United - Wichita" /></div>
          <div><label>Copied team-tab range</label><textarea name="snapshot" required maxlength="90000" rows="12" spellcheck="false" placeholder="Paste copied cells here"></textarea></div>
          <div class="note">Choose the attendance column for the meet. No roster removals are made.</div>
          <div class="action-row"><button class="btn-orange" type="submit">Build Preview</button><a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/registered">Cancel</a></div>
        </form>
      </div>`;
  }

  function plansFor(parsed, meet, team) {
    const plans = planMsslSync(parsed.rows || [], meet, team);
    for (const invalid of parsed.invalidRows || []) plans.push({
      status: 'REVIEW', reason: invalid.reason, notes: [], sourceRow: invalid.sourceRow,
      candidate: { helmetNumber: '', name: '', age: '', options: {} },
    });
    return plans;
  }

  function previewPage(req, meet, team, snapshot, parsed, plans = []) {
    if (parsed.needsAttendanceChoice) {
      const choices = parsed.attendanceColumns.map(column => `<option value="${column.safeIndex}">${esc(column.label)}</option>`).join('');
      return `<div class="page-header"><h1>MSSL Sheet Sync</h1><div class="sub">${esc(meet.meetName)} · read-only source</div></div>
        <div class="card" style="max-width:900px"><h2>Select attendance column</h2><p>Multiple meet attendance columns were found. Choose the meet to preview.</p>
        <form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync/preview" class="stack">
          <input type="hidden" name="team" value="${esc(team)}"><textarea name="snapshot" hidden>${esc(parsed.safeSnapshot || snapshot)}</textarea>
          <div><label>Attendance</label><select name="attendanceColumnIndex" required>${choices}</select></div>
          <button class="btn-orange" type="submit">Preview This Meet</button>
        </form></div>`;
    }
    const counts = plans.reduce((all, plan) => { all[plan.status] = (all[plan.status] || 0) + 1; return all; }, {});
    const started = meetHasStartedRacing(meet);
    const hasReview = plans.some(plan => plan.status === 'REVIEW');
    const safeSnapshot = parsed.safeSnapshot || snapshot;
    const rows = plans.map(plan => {
      const options = plan.candidate.options || {};
      const entries = ['quad', 'novice', 'elite', 'challengeUp', 'open'].filter(key => options[key])
        .map(key => ({ quad: 'Quad', novice: 'Novice', elite: 'Elite', challengeUp: 'Challenge Up', open: 'Open' })[key]).join(', ');
      return `<tr><td><strong>${esc(plan.status)}</strong></td><td>${esc(plan.candidate.helmetNumber)}</td><td>${esc(plan.candidate.name)}</td><td>${esc(plan.candidate.age)}</td><td>${esc(entries)}</td><td>${esc(plan.reason || (plan.notes || []).join(' '))}</td></tr>`;
    }).join('');
    const status = started
      ? '<div class="danger">This meet has scored or closed races. Import is locked to protect race-day results.</div>'
      : hasReview
        ? '<div class="danger">Resolve every REVIEW row, then preview again. No rows will be applied from a conflicted preview.</div>'
        : '<div class="note">Apply updates registrations only. Existing lanes, heat order, places, and results are untouched. Use Rebuild Assignments separately if you intend to place new attendees into race sheets.</div>';
    const canApply = !started && !hasReview && plans.some(plan => ['NEW', 'UPDATE'].includes(plan.status));
    const apply = canApply ? `<form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync/apply" onsubmit="return confirm('Apply ${counts.NEW || 0} new registration(s) and ${counts.UPDATE || 0} update(s)? This will not edit the MSSL workbook or rebuild races.')">
        <input type="hidden" name="team" value="${esc(team)}"><input type="hidden" name="attendanceColumnIndex" value="${parsed.safeSelectedAttendance}"><textarea name="snapshot" hidden>${esc(safeSnapshot)}</textarea>
        <button class="btn-orange" type="submit">Apply ${counts.NEW || 0} New · ${counts.UPDATE || 0} Updates</button>
      </form>` : '';
    return `<div class="page-header"><h1>MSSL Sheet Import Preview</h1><div class="sub">${esc(meet.meetName)} · ${esc(team)} · ${esc(parsed.attendanceLabel)}</div></div>
      <div class="card"><p><strong>Preview only.</strong> The MSSL workbook has not been modified. The pasted source is not saved by SSM. No roster removals are performed.</p>
        <p>${counts.NEW || 0} new · ${counts.UPDATE || 0} updates · ${counts.UNCHANGED || 0} unchanged · ${counts.REVIEW || 0} review</p>${status}
        <div style="overflow:auto"><table class="table"><thead><tr><th>Action</th><th>Helmet</th><th>Name</th><th>Race Age</th><th>Entries</th><th>Notes</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No attending skaters found.</td></tr>'}</tbody></table></div>
        <div class="action-row" style="margin-top:16px">${apply}<a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync">Start over</a><a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/registered">Back to Registered</a></div>
      </div>`;
  }

  router.get('/portal/meet/:meetId/mssl-sheet-sync', requireRole('meet_director'), (req, res) => {
    const meet = authorized(req, res);
    if (!meet) return;
    return res.send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: entryForm(meet) }));
  });

  router.post('/portal/meet/:meetId/mssl-sheet-sync/preview', requireRole('meet_director'), (req, res) => {
    const meet = authorized(req, res);
    if (!meet) return;
    const team = String(req.body.team || '').trim();
    const snapshot = String(req.body.snapshot || '');
    if (!team || !snapshot || snapshot.length > 90000) {
      return res.send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: entryForm(meet, 'Enter a team and paste a snapshot under 90,000 characters.') }));
    }
    const parsed = parseMsslSnapshot(snapshot, req.body.attendanceColumnIndex);
    if (parsed.error) return res.send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: entryForm(meet, parsed.error) }));
    if (parsed.needsAttendanceChoice) return res.send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: previewPage(req, meet, team, snapshot, parsed) }));
    const plans = plansFor(parsed, meet, team);
    return res.send(pageShell({ title: 'MSSL Sheet Import Preview', user: req.user, meet, activeTab: 'registered', bodyHtml: previewPage(req, meet, team, snapshot, parsed, plans) }));
  });

  router.post('/portal/meet/:meetId/mssl-sheet-sync/apply', requireRole('meet_director'), (req, res) => {
    const meet = authorized(req, res);
    if (!meet) return;
    const team = String(req.body.team || '').trim();
    const snapshot = String(req.body.snapshot || '');
    if (meetHasStartedRacing(meet)) return res.status(409).send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: '<div class="danger">Import is locked because this meet has scored or closed races.</div>' }));
    const parsed = parseMsslSnapshot(snapshot, req.body.attendanceColumnIndex);
    if (parsed.error || parsed.needsAttendanceChoice) {
      return res.status(400).send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: entryForm(meet, parsed.error || 'Select an attendance column and preview again.') }));
    }
    const plans = plansFor(parsed, meet, team);
    if (plans.some(plan => plan.status === 'REVIEW')) {
      return res.status(409).send(pageShell({ title: 'MSSL Sheet Import Preview', user: req.user, meet, activeTab: 'registered', bodyHtml: previewPage(req, meet, team, snapshot, parsed, plans) }));
    }
    if (!plans.some(plan => ['NEW', 'UPDATE'].includes(plan.status))) {
      return res.send(pageShell({ title: 'MSSL Sheet Import Preview', user: req.user, meet, activeTab: 'registered', bodyHtml: previewPage(req, meet, team, snapshot, parsed, plans) }));
    }
    const result = applyMsslSync(plans, meet);
    saveDb(req.db);
    return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/registered?msslImported=${result.added}&msslUpdated=${result.updated}`);
  });

  return router;
};
