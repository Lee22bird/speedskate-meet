const express = require('express');
const crypto = require('crypto');
const { esc } = require('../utils/html');
const { canEditMeet } = require('../utils/auth');
const { getMeetOr404 } = require('../services/meetHelpers');
const { meetHasStartedRacing } = require('../services/regenGuard');
const { parseMsslSnapshot, planMsslSync, applyMsslSync } = require('../services/msslSheetSync');
const googleSheets = require('../services/msslGoogleSheets');

module.exports = function createMsslSheetSyncRoutes({ requireRole, pageShell, saveDb, getSessionUser } = {}) {
  const router = express.Router();

  function authorized(req, res) {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet || !canEditMeet(req.user, meet)) {
      res.redirect('/portal');
      return null;
    }
    return meet;
  }

  function connection(meet) {
    return meet.msslSheetConnection || null;
  }

  function entryForm(meet, tabs = [], message = '', selection = {}) {
    const configured = googleSheets.isConfigured();
    const connected = !!connection(meet)?.encryptedRefreshToken;
    const connectAction = configured
      ? connected
        ? `<form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync/disconnect" onsubmit="return confirm('Disconnect this Google account from SSM?')"><button class="btn2" type="submit">Disconnect Google</button></form>`
        : `<a class="btn-orange" href="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync/connect">Connect Google account</a>`
      : '<div class="notice">Google connection setup is not complete on the server yet. SSM needs a Google OAuth client ID/secret, a token encryption key, this workbook ID, and its OAuth callback URL configured on the hosting service.</div>';
    const selectedTabTitle = String(selection.tabTitle || '');
    const tabOptions = tabs.map(tab => `<option value="${esc(tab.title)}" ${tab.title === selectedTabTitle ? 'selected' : ''}>${esc(tab.title)}</option>`).join('');
    const fetchForm = configured && connected
      ? `<form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync/fetch-preview" class="stack">
          <div><label>MSSL team tab</label><select name="tabTitle" required>${tabOptions || '<option value="">No tabs available</option>'}</select></div>
          <div><label>SSM team name</label><input name="team" required maxlength="120" placeholder="Team United - Wichita" value="${esc(selection.team || '')}"></div>
          <div class="note">Choose the matching team roster tab, not a schedule or points tab. Fetches that tab directly from Google for a duplicate-safe preview; nothing is applied until you confirm it.</div>
          <button class="btn-orange" type="submit" ${tabs.length ? '' : 'disabled'}>Fetch and Build Preview</button>
        </form>`
      : '';
    return `<div class="page-header"><h1>MSSL Sheet Sync</h1><div class="sub">${esc(meet.meetName)} · Google read-only connection</div></div>
      ${message ? `<div class="notice">${esc(message)}</div>` : ''}
      <div class="card" style="max-width:900px">
        <p>SSM requests Google’s read-only Sheets permission. The workbook is never edited. Fetched data is reduced to the registration fields needed for this preview; birthdates and unrelated columns are discarded.</p>
        <p>Sync only adds or updates registrations. It does not remove skaters or change existing races, lanes, placements, or results.</p>
        <div class="action-row">${connectAction}</div>
        ${fetchForm}
        <div class="action-row"><a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/registered">Back to Registered</a></div>
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

  function previewPage(req, meet, team, parsed, plans = [], tabTitle = '') {
    if (parsed.needsAttendanceChoice) {
      const choices = parsed.attendanceColumns.map(column => `<option value="${column.safeIndex}">${esc(column.label)}</option>`).join('');
      return `<div class="page-header"><h1>MSSL Sheet Sync</h1><div class="sub">${esc(meet.meetName)} · ${esc(tabTitle)}</div></div>
        <div class="card" style="max-width:900px"><h2>Select attendance column</h2><p>Multiple meet attendance columns were found. Choose the meet to preview.</p>
        <form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync/review-fetched" class="stack">
          <input type="hidden" name="team" value="${esc(team)}"><input type="hidden" name="tabTitle" value="${esc(tabTitle)}">
          <textarea name="snapshot" hidden>${esc(parsed.safeSnapshot || '')}</textarea>
          <div><label>Attendance</label><select name="attendanceColumnIndex" required>${choices}</select></div>
          <button class="btn-orange" type="submit">Preview This Meet</button>
        </form></div>`;
    }
    const counts = plans.reduce((all, plan) => { all[plan.status] = (all[plan.status] || 0) + 1; return all; }, {});
    const started = meetHasStartedRacing(meet);
    const hasReview = plans.some(plan => plan.status === 'REVIEW');
    const rows = plans.map(plan => {
      const options = plan.candidate.options || {};
      const entries = ['quad', 'novice', 'elite', 'challengeUp', 'open'].filter(key => options[key])
        .map(key => ({ quad: 'Quad', novice: 'Novice', elite: 'Elite', challengeUp: 'Challenge Up', open: 'Open' })[key]).join(', ');
      return `<tr><td><strong>${esc(plan.status)}</strong></td><td>${esc(plan.candidate.helmetNumber)}</td><td>${esc(plan.candidate.name)}</td><td>${esc(plan.candidate.age)}</td><td>${esc(entries)}</td><td>${esc(plan.reason || (plan.notes || []).join(' '))}</td></tr>`;
    }).join('');
    const status = started
      ? '<div class="danger">This meet has scored or closed races. Import is locked to protect race-day results.</div>'
      : hasReview
        ? '<div class="danger">Resolve every REVIEW row, then fetch and preview again. No rows will be applied from a conflicted preview.</div>'
        : '<div class="note">Applying changes registrations only. Existing lanes, heat order, places, and results remain untouched. Use Rebuild Assignments separately if needed.</div>';
    const canApply = !started && !hasReview && plans.some(plan => ['NEW', 'UPDATE'].includes(plan.status));
    const apply = canApply ? `<form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync/apply" onsubmit="return confirm('Apply ${counts.NEW || 0} new registration(s) and ${counts.UPDATE || 0} update(s)? This will not edit the MSSL workbook or rebuild races.')">
        <input type="hidden" name="team" value="${esc(team)}"><input type="hidden" name="attendanceColumnIndex" value="${parsed.safeSelectedAttendance}"><input type="hidden" name="tabTitle" value="${esc(tabTitle)}"><textarea name="snapshot" hidden>${esc(parsed.safeSnapshot || '')}</textarea>
        <button class="btn-orange" type="submit">Apply ${counts.NEW || 0} New · ${counts.UPDATE || 0} Updates</button>
      </form>` : '';
    return `<div class="page-header"><h1>MSSL Sheet Import Preview</h1><div class="sub">${esc(meet.meetName)} · ${esc(tabTitle)} · ${esc(parsed.attendanceLabel)}</div></div>
      <div class="card"><p><strong>Preview only.</strong> This is a fresh read from Google. The MSSL workbook has not been modified; no source data is stored by SSM. No roster removals are performed.</p>
        <p>${counts.NEW || 0} new · ${counts.UPDATE || 0} updates · ${counts.UNCHANGED || 0} unchanged · ${counts.REVIEW || 0} review</p>${status}
        <div style="overflow:auto"><table class="table"><thead><tr><th>Action</th><th>Helmet</th><th>Name</th><th>Race Age</th><th>Entries</th><th>Notes</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No attending skaters found.</td></tr>'}</tbody></table></div>
        <div class="action-row" style="margin-top:16px">${apply}<a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync">Fetch again</a><a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/registered">Back to Registered</a></div>
      </div>`;
  }

  async function bearerFor(meet) {
    const stored = connection(meet)?.encryptedRefreshToken;
    if (!stored) throw new Error('Connect a Google account first.');
    const c = googleSheets.config();
    const refresh = googleSheets.decryptToken(stored, c.encryptionKey);
    return googleSheets.accessToken(refresh, c);
  }

  async function tabsFor(meet) {
    if (!googleSheets.isConfigured() || !connection(meet)?.encryptedRefreshToken) return [];
    return googleSheets.listTabs(googleSheets.config().spreadsheetId, await bearerFor(meet));
  }

  router.get('/portal/meet/:meetId/mssl-sheet-sync', requireRole('meet_director'), async (req, res) => {
    const meet = authorized(req, res);
    if (!meet) return;
    let tabs = [];
    let message = '';
    try { tabs = await tabsFor(meet); }
    catch (err) { message = `Could not load Google tabs: ${err.message}`; }
    return res.send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: entryForm(meet, tabs, message) }));
  });

  router.get('/portal/meet/:meetId/mssl-sheet-sync/connect', requireRole('meet_director'), (req, res) => {
    const meet = authorized(req, res);
    if (!meet) return;
    if (!googleSheets.isConfigured()) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync`);
    const state = googleSheets.signState({ meetId: String(meet.id), userId: String(req.user.id), nonce: crypto.randomBytes(18).toString('base64url'), issuedAt: Date.now() }, googleSheets.config().encryptionKey);
    return res.redirect(googleSheets.authorizationUrl({ ...googleSheets.config(), state }));
  });

  router.get('/portal/mssl-sheet-sync/oauth/callback', (req, res) => {
    const data = getSessionUser(req);
    const c = googleSheets.config();
    try {
      if (!googleSheets.isConfigured()) throw new Error('Google Sheets connection is not configured on the server.');
      if (req.query.error) throw new Error('Google authorization was cancelled.');
      const state = googleSheets.verifyState(req.query.state, c.encryptionKey);
      if (!data || String(state.userId) !== String(data.user.id)) throw new Error('Sign in as the same SSM meet director who started the Google connection.');
      const meet = getMeetOr404(data.db, state.meetId);
      if (!meet || !canEditMeet(data.user, meet)) throw new Error('You no longer have permission to manage this meet.');
      if (!req.query.code) throw new Error('Google did not return an authorization code.');
      exchangeAndStore(req.query.code, c, meet, data.db, saveDb).then(() => res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync?connected=1`)).catch(err => res.status(400).send(pageShell({ title: 'Google connection failed', user: data.user, meet, bodyHtml: `<div class="page-header"><h1>Google connection failed</h1></div><div class="card"><div class="danger">${esc(err.message)}</div><a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync">Back</a></div>` })));
    } catch (err) {
      const state = (() => { try { return googleSheets.verifyState(req.query.state, c.encryptionKey); } catch (_) { return null; } })();
      const meet = data && state ? getMeetOr404(data.db, state.meetId) : null;
      if (!meet || !data) return res.status(400).send('Google authorization failed. Return to SSM and start again.');
      return res.status(400).send(pageShell({ title: 'Google connection failed', user: data.user, meet, bodyHtml: `<div class="page-header"><h1>Google connection failed</h1></div><div class="card"><div class="danger">${esc(err.message)}</div><a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync">Back</a></div>` }));
    }
  });

  router.post('/portal/meet/:meetId/mssl-sheet-sync/disconnect', requireRole('meet_director'), (req, res) => {
    const meet = authorized(req, res);
    if (!meet) return;
    delete meet.msslSheetConnection;
    saveDb(req.db);
    return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/mssl-sheet-sync`);
  });

  router.post('/portal/meet/:meetId/mssl-sheet-sync/fetch-preview', requireRole('meet_director'), async (req, res) => {
    const meet = authorized(req, res);
    if (!meet) return;
    const tabTitle = String(req.body.tabTitle || '').trim();
    const team = String(req.body.team || '').trim();
    try {
      if (!tabTitle || !team) throw new Error('Choose a team tab and enter the SSM team name.');
      const text = await googleSheets.fetchTab(googleSheets.config().spreadsheetId, tabTitle, await bearerFor(meet));
      const parsed = parseMsslSnapshot(text, '');
      if (parsed.error) {
        const hint = parsed.error.includes('Attendance Yes=1 No=0')
          ? ` The selected tab, “${tabTitle},” does not have the roster attendance columns. Choose the matching team roster tab instead of a schedule or points tab.`
          : '';
        throw new Error(`${parsed.error}${hint}`);
      }
      if (parsed.needsAttendanceChoice) return res.send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: previewPage(req, meet, team, parsed, [], tabTitle) }));
      const plans = plansFor(parsed, meet, team);
      return res.send(pageShell({ title: 'MSSL Sheet Import Preview', user: req.user, meet, activeTab: 'registered', bodyHtml: previewPage(req, meet, team, parsed, plans, tabTitle) }));
    } catch (err) {
      let tabs = [];
      try { tabs = await tabsFor(meet); } catch (_) { /* Keep the original fetch error visible. */ }
      return res.status(400).send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: entryForm(meet, tabs, err.message, { tabTitle, team }) }));
    }
  });

  router.post('/portal/meet/:meetId/mssl-sheet-sync/review-fetched', requireRole('meet_director'), (req, res) => {
    const meet = authorized(req, res);
    if (!meet) return;
    const team = String(req.body.team || '').trim();
    const tabTitle = String(req.body.tabTitle || '').trim();
    const snapshot = String(req.body.snapshot || '');
    const parsed = parseMsslSnapshot(snapshot, req.body.attendanceColumnIndex);
    if (parsed.error || parsed.needsAttendanceChoice) return res.status(400).send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: entryForm(meet, [], parsed.error || 'Choose an attendance column.') }));
    const plans = plansFor(parsed, meet, team);
    return res.send(pageShell({ title: 'MSSL Sheet Import Preview', user: req.user, meet, activeTab: 'registered', bodyHtml: previewPage(req, meet, team, parsed, plans, tabTitle) }));
  });

  router.post('/portal/meet/:meetId/mssl-sheet-sync/apply', requireRole('meet_director'), (req, res) => {
    const meet = authorized(req, res);
    if (!meet) return;
    const team = String(req.body.team || '').trim();
    const tabTitle = String(req.body.tabTitle || '').trim();
    const snapshot = String(req.body.snapshot || '');
    if (meetHasStartedRacing(meet)) return res.status(409).send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: '<div class="danger">Import is locked because this meet has scored or closed races.</div>' }));
    const parsed = parseMsslSnapshot(snapshot, req.body.attendanceColumnIndex);
    if (parsed.error || parsed.needsAttendanceChoice) return res.status(400).send(pageShell({ title: 'MSSL Sheet Sync', user: req.user, meet, activeTab: 'registered', bodyHtml: entryForm(meet, [], parsed.error || 'Fetch and preview again.') }));
    const plans = plansFor(parsed, meet, team);
    if (plans.some(plan => plan.status === 'REVIEW')) return res.status(409).send(pageShell({ title: 'MSSL Sheet Import Preview', user: req.user, meet, activeTab: 'registered', bodyHtml: previewPage(req, meet, team, parsed, plans, tabTitle) }));
    if (!plans.some(plan => ['NEW', 'UPDATE'].includes(plan.status))) return res.send(pageShell({ title: 'MSSL Sheet Import Preview', user: req.user, meet, activeTab: 'registered', bodyHtml: previewPage(req, meet, team, parsed, plans, tabTitle) }));
    const result = applyMsslSync(plans, meet);
    saveDb(req.db);
    return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/registered?msslImported=${result.added}&msslUpdated=${result.updated}`);
  });

  return router;
};

async function exchangeAndStore(code, c, meet, db, saveDb) {
  const tokens = await googleSheets.exchangeCode(String(code), c);
  if (!tokens.refresh_token) throw new Error('Google did not provide a refresh token. Disconnect the app from your Google Account security settings, then connect again.');
  meet.msslSheetConnection = {
    encryptedRefreshToken: googleSheets.encryptToken(tokens.refresh_token, c.encryptionKey),
    connectedAt: new Date().toISOString(),
  };
  saveDb(db);
}
