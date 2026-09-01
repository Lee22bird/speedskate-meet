const express = require('express');
const { esc, cap } = require('../utils/html');
const { nowIso } = require('../utils/date');
const { canEditMeet, hasRole } = require('../utils/auth');
const { getMeetOr404, meetDateLabel } = require('../services/meetHelpers');
const { orderedRaces } = require('../services/raceDay');
const {
  PROTEST_CATEGORIES, isRaceSpecific,
  protestsForMeet, protestsForCoach, findProtest, buildProtest,
  protestDeadlineMinutes, raceProtestWindowClosed,
} = require('../services/protests');
const protestSync = require('../services/desktopProtestSync');

function money(n) { return '$' + Number(n || 0).toFixed(0); }

// Coaches whose team has at least one registration in this meet may file.
function coachHasSkaters(meet, user) {
  const team = String(user && user.team || '').trim().toLowerCase();
  if (!team) return false;
  return (meet.registrations || []).some(r => String(r.team || '').trim().toLowerCase() === team);
}

function raceOptions(meet) {
  return orderedRaces(meet)
    .filter(r => r.type !== 'time_trial')
    .map(r => `<option value="${esc(r.id)}" data-label="${esc(raceLabelFor(r))}">${esc(raceLabelFor(r))}</option>`)
    .join('');
}
function raceLabelFor(r) {
  return [r.groupLabel, cap(r.division || ''), r.distanceLabel].filter(Boolean).join(' · ');
}

function stateBadge(state) {
  const map = {
    new: ['New', '#c2410c', '#fff7ed', '#fed7aa'],
    review: ['Under review', '#0369a1', '#f0f9ff', '#bae6fd'],
    upheld: ['Upheld', '#047857', '#ecfdf5', '#a7f3d0'],
    denied: ['Denied', '#475569', '#f8fafc', '#e2e8f0'],
  };
  const [label, color, bg, line] = map[state] || map.new;
  return `<span style="display:inline-flex;padding:4px 11px;border-radius:999px;font-size:12px;font-weight:800;color:${color};background:${bg};border:1px solid ${line}">${esc(label)}</span>`;
}

// ── Coach: filing form ───────────────────────────────────────────────────────
function renderProtestForm(meet, user, error = '') {
  const teamRegs = (meet.registrations || []).filter(r => String(r.team || '').trim().toLowerCase() === String(user.team || '').trim().toLowerCase());
  const hasFee = Number(meet.protestFee || 0) > 0;
  const deadline = protestDeadlineMinutes(meet);
  return `
    <style>
      .pf-wrap { max-width: 780px; }
      .pf-back { margin-bottom: 16px; }
      .pf-info { background: #fff7ed; border: 1px solid #fed7aa; border-left: 5px solid var(--orange);
        border-radius: var(--radius); padding: 22px 24px; margin-bottom: 18px; }
      .pf-info-title { font-size: 17px; font-weight: 800; color: var(--navy); margin-bottom: 8px;
        display: flex; align-items: center; gap: 8px; }
      .pf-info-body { font-size: 15px; line-height: 1.65; color: #7c2d12; }
      .pf-info-body strong { color: #9a3412; }
      .pf-info-row { margin-top: 12px; padding-top: 12px; border-top: 1px solid #fed7aa;
        font-size: 14.5px; line-height: 1.55; color: #7c2d12; }
      .pf-info-row strong { color: #9a3412; }
      .pf-form .pf-field { margin-bottom: 22px; }
      .pf-form .pf-field:last-of-type { margin-bottom: 0; }
      .pf-form label.pf-label { display: block; font-size: 15px; font-weight: 700; color: var(--navy);
        text-transform: none; letter-spacing: 0; margin-bottom: 7px; }
      .pf-form .pf-hint { font-size: 13.5px; color: var(--muted); margin-top: 7px; line-height: 1.5; }
      .pf-form select, .pf-form textarea { font-size: 15px; padding: 13px 14px; }
      .pf-form textarea { min-height: 160px; line-height: 1.55; }
      .pf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .pf-actions { display: flex; gap: 10px; align-items: center; margin-top: 26px; }
      .pf-actions .btn-orange { font-size: 15px; font-weight: 800; padding: 14px 30px; }
      .pf-actions .btn2 { font-size: 15px; padding: 14px 24px; }
      @media (max-width: 640px) { .pf-grid { grid-template-columns: 1fr; } }
    </style>
    <div class="pf-wrap">
      <div class="page-header"><h1>File a Protest</h1><div class="sub">${esc(meet.meetName)} • ${esc(user.team || 'Your Team')}</div></div>
      <div class="action-row pf-back"><a class="btn2" href="/portal/coach">← Back to Coach Portal</a></div>
      ${error ? `<div class="bad" style="margin-bottom:16px">${esc(error)}</div>` : ''}

      <div class="pf-info">
        <div class="pf-info-title">⚑ Before you file</div>
        <div class="pf-info-body">
          Per USARS <strong>SR503.2</strong>, the decision of a speed skating official is final — a
          <strong>disqualification, placement, or foul call cannot be protested</strong>. A protest is a written
          complaint concerning <strong>status, eligibility, conduct, competition, officials, or membership</strong>.
          The chief referee (here: a judge or the meet director) decides protests. Notes are confidential and are
          not published with results.
        </div>
        ${hasFee ? `<div class="pf-info-row"><strong>Protest fee: ${money(meet.protestFee)}</strong> — non-refundable regardless of the outcome, and settled <strong>in person</strong> with the meet director (they'll find you). This form does not take payment. Your protest is accepted and reviewed right away.</div>` : ''}
        ${deadline ? `<div class="pf-info-row">Race-specific protests must be filed within <strong>${deadline} minutes</strong> of that race finishing. After that, see the meet director to file in person.</div>` : ''}
      </div>

      <div class="card pf-form">
        <form method="POST" action="/portal/meet/${esc(meet.id)}/coach/protest">
          <div class="pf-grid">
            <div class="pf-field">
              <label class="pf-label">Category</label>
              <select name="category" id="protestCategory" required>
                <option value="">Choose…</option>
                ${PROTEST_CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
              </select>
              <div class="pf-hint">Six USARS categories.</div>
            </div>
            <div class="pf-field">
              <label class="pf-label">Race it occurred in</label>
              <select name="raceId" id="protestRace"><option value="">Not race-specific</option>${raceOptions(meet)}</select>
              <input type="hidden" name="raceLabel" id="protestRaceLabel" value="" />
              <div class="pf-hint">Applies to Competition, Eligibility &amp; Conduct protests. Leave as “Not race-specific” otherwise.</div>
            </div>
          </div>
          <div class="pf-field">
            <label class="pf-label">Skater <span style="font-weight:600;color:var(--muted)">(optional — must be your team)</span></label>
            <select name="registrationId">
              <option value="">Not skater-specific</option>
              ${teamRegs.map(r => `<option value="${esc(r.id)}">${esc(r.name || '')}${r.helmetNumber ? ' • #' + esc(r.helmetNumber) : ''}</option>`).join('')}
            </select>
          </div>
          <div class="pf-field">
            <label class="pf-label">Written statement</label>
            <textarea name="statement" rows="6" maxlength="2000" required placeholder="Describe the complaint. Be specific — this is the written record the officials review."></textarea>
            <div class="pf-hint">Up to 2000 characters.</div>
          </div>
          <div class="pf-actions">
            <button class="btn-orange" type="submit">Submit protest</button>
            <a class="btn2" href="/portal/coach">Cancel</a>
          </div>
        </form>
      </div>
    </div>

    <script>
      (function(){
        var race = document.getElementById('protestRace');
        var label = document.getElementById('protestRaceLabel');
        function syncLabel(){
          if(!race || !label) return;
          var opt = race.options[race.selectedIndex];
          label.value = (opt && opt.getAttribute('data-label')) || '';
        }
        if(race){ race.addEventListener('change', syncLabel); syncLabel(); }
      })();
    </script>`;
}

// ── Officials: inbox ─────────────────────────────────────────────────────────
function renderProtestInbox(meet, user, flash = '', syncBanner = '') {
  const rows = protestsForMeet(meet);
  const canCorrect = canEditMeet(user, meet); // Correction Mode is meet-director only
  const cards = rows.slice().reverse().map(p => `
    <div class="card" style="margin-bottom:12px;border-left:5px solid ${p.state === 'upheld' ? 'var(--green)' : p.state === 'denied' ? 'var(--muted,#94a3b8)' : 'var(--orange)'}">
      <div class="row between center" style="flex-wrap:wrap;gap:10px">
        <div>
          <div class="bold">${esc(p.id)} • ${esc(p.category)}${p.raceLabel ? ' • ' + esc(p.raceLabel) : ''}</div>
          <div class="note">Filed by ${esc(p.filedByName || '—')}${p.team ? ' (' + esc(p.team) + ')' : ''}${p.createdAt ? ' • ' + esc(new Date(p.createdAt).toLocaleString()) : ''}</div>
        </div>
        ${stateBadge(p.state)}
      </div>
      <div class="card" style="margin-top:10px;background:var(--off,#f8fafc)"><div style="white-space:pre-wrap">${esc(p.statement)}</div></div>
      ${Number(p.feeAmount || 0) > 0 ? `
        <div class="row between center" style="margin-top:10px;flex-wrap:wrap;gap:8px">
          <div class="note"><strong>Fee ${money(p.feeAmount)}</strong> — non-refundable, paid in person. ${p.feeCollected ? `<span style="color:#047857;font-weight:700">✔ Collected${p.feeCollectedBy ? ' by ' + esc(p.feeCollectedBy) : ''}</span>` : '<span style="color:#c2410c;font-weight:700">Not yet collected</span>'}</div>
          ${canCorrect && !p.feeCollected ? `<form method="POST" action="/portal/meet/${esc(meet.id)}/protests/${esc(p.id)}/fee" style="margin:0"><button class="btn2 btn-sm" type="submit">Mark fee collected</button></form>` : ''}
        </div>` : ''}
      ${p.ruling ? `<div class="note" style="margin-top:8px"><strong>Ruling:</strong> ${esc(p.ruling)}${p.ruledByName ? ' — ' + esc(p.ruledByName) : ''}</div>` : ''}
      ${(p.state === 'new' || p.state === 'review') ? `
        <form method="POST" action="/portal/meet/${esc(meet.id)}/protests/${esc(p.id)}/rule" style="margin-top:12px">
          <label>Ruling / reason</label>
          <textarea name="ruling" rows="2" placeholder="The official's decision note (goes in the packet)."></textarea>
          <div class="action-row" style="margin-top:10px">
            <button class="btn-good" type="submit" name="state" value="upheld">Uphold${p.raceId && canCorrect ? ' → open correction' : ''}</button>
            <button class="btn-danger" type="submit" name="state" value="denied">Deny</button>
          </div>
          ${p.raceId && !canCorrect ? `<div class="note" style="margin-top:6px">Upholding records the ruling; a meet director opens Correction Mode for the race.</div>` : ''}
        </form>` : ''}
    </div>`).join('') || '<div class="card"><div class="muted">No protests filed.</div></div>';

  return `
    <div class="page-header"><h1>Protests</h1><div class="sub">${esc(meet.meetName)} • ${esc(meetDateLabel(meet) || '')}</div></div>
    <div class="action-row" style="margin-bottom:14px"><a class="btn2" href="/portal/meet/${esc(meet.id)}/results">← Results</a></div>
    ${flash ? `<div class="good" style="margin-bottom:16px">${esc(flash)}</div>` : ''}
    ${syncBanner}
    <div class="note" style="margin-bottom:14px">Confidential — officials only. Coaches see only the protests they filed.</div>
    ${cards}`;
}

module.exports = function createProtestRoutes(deps = {}) {
  const { requireRole, pageShell, saveDb } = deps;
  const router = express.Router();

  // Coach: filing form
  router.get('/portal/meet/:meetId/coach/protest', requireRole('coach'), (req, res) => {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet) return res.redirect('/portal');
    if (!coachHasSkaters(meet, req.user)) {
      return res.status(403).send(pageShell({ title: 'File a Protest', user: req.user, meet, bodyHtml: `<div class="page-header"><h1>File a Protest</h1></div><div class="card"><div class="danger">You have no skaters registered in this meet, so you can't file a protest here.</div><div class="action-row" style="margin-top:12px"><a class="btn2" href="/portal/coach">Back</a></div></div>` }));
    }
    res.send(pageShell({ title: 'File a Protest', user: req.user, meet, bodyHtml: renderProtestForm(meet, req.user, req.query.error || '') }));
  });

  // Coach: create
  router.post('/portal/meet/:meetId/coach/protest', requireRole('coach'), (req, res) => {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet) return res.redirect('/portal');
    if (!coachHasSkaters(meet, req.user)) return res.status(403).send('Forbidden');
    // Optional skater must belong to the coach's team.
    let registrationId = String(req.body.registrationId || '');
    if (registrationId) {
      const reg = (meet.registrations || []).find(r => String(r.id) === registrationId);
      const sameTeam = reg && String(reg.team || '').trim().toLowerCase() === String(req.user.team || '').trim().toLowerCase();
      if (!sameTeam) registrationId = '';
    }
    // Race-specific protest past the online window: the director can still take it
    // in person, but the coach can't file it here.
    if (isRaceSpecific(req.body.category)) {
      const race = (meet.races || []).find(r => String(r.id) === String(req.body.raceId || ''));
      if (race && raceProtestWindowClosed(meet, race)) {
        const msg = `The online protest window for that race has closed (${protestDeadlineMinutes(meet)} minutes after it finished). See the meet director to file in person.`;
        return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/coach/protest?error=${encodeURIComponent(msg)}`);
      }
    }
    const built = buildProtest(meet, {
      category: req.body.category, raceId: req.body.raceId, raceLabel: req.body.raceLabel,
      registrationId, statement: req.body.statement,
      filedByUserId: req.user.id, filedByName: req.user.name || req.user.fullName || req.user.email || 'Coach', team: req.user.team || '',
    }, nowIso());
    if (!built.ok) {
      return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/coach/protest?error=${encodeURIComponent(built.error)}`);
    }
    if (!Array.isArray(meet.protests)) meet.protests = [];
    meet.protests.push(built.protest);
    meet.updatedAt = nowIso();
    saveDb(req.db);
    res.redirect('/portal/coach?protestFiled=' + encodeURIComponent(built.protest.id));
  });

  // Officials: inbox
  router.get('/portal/meet/:meetId/protests', requireRole('judge', 'meet_director'), (req, res) => {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet) return res.redirect('/portal');
    // Desktop only: a live-protest-sync status banner so officials running an
    // imported meet know whether coach phone protests are being pulled in.
    let syncBanner = '';
    if (process.env.SSM_DESKTOP === '1' && meet.importedFromHostedMeetId) {
      const st = require('../services/desktopProtestSync').statusFor(meet.id);
      syncBanner = st.connected
        ? `<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="row between center" style="flex-wrap:wrap;gap:8px"><div class="note">🔌 <strong>Live protest sync on</strong> — coach phone protests pull in automatically${st.lastError ? ' · <span style="color:#c2410c">' + esc(st.lastError) + '</span>' : (st.lastSyncAt ? ' · synced ' + esc(new Date(st.lastSyncAt).toLocaleTimeString()) : '')}.</div><a class="btn2 btn-sm" href="/desktop/meet/${esc(meet.id)}/protest-sync">Manage</a></div></div>`
        : `<div class="card" style="border-left:4px solid var(--orange);margin-bottom:12px"><div class="row between center" style="flex-wrap:wrap;gap:8px"><div class="note">📴 <strong>Live protest sync off</strong> — coach phone protests won't reach this desktop meet until you connect.</div><a class="btn-orange btn-sm" href="/desktop/meet/${esc(meet.id)}/protest-sync">Connect</a></div></div>`;
    }
    res.send(pageShell({ title: 'Protests', user: req.user, meet, activeTab: 'results', bodyHtml: renderProtestInbox(meet, req.user, req.query.flash || '', syncBanner) }));
  });

  // Officials: protests as JSON — read-only, additive. The SSM Desktop app calls
  // this on the ONLINE copy of an imported meet to pull coach-filed (phone)
  // protests down into a desktop-run meet. Same auth as the inbox above.
  router.get('/portal/meet/:meetId/protests.json', requireRole('judge', 'meet_director'), (req, res) => {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok: false, error: 'Meet not found.' });
    // Protests are confidential officials records — scope to THIS meet's
    // officials, not any account that merely holds the judge/director role.
    // canEditMeet is the meet-scoped check (owner + assigned tabulators);
    // canJudgeMeet is deliberately NOT used here — it passes ANY judge.
    if (!hasRole(req.user, 'super_admin') && !canEditMeet(req.user, meet)) {
      return res.status(403).json({ ok: false, error: 'You are not an official on this meet.' });
    }
    res.json({ ok: true, protests: protestsForMeet(meet) });
  });

  // Desktop protest sync v2 (push-back): a desktop-run meet mirrors an official's
  // ruling/fee outcome UP to this online copy so the coach who filed from their
  // phone sees the result in the app. Additive + strictly scoped: it touches ONLY
  // the matched protest's ruling/fee fields — never races, results, or scoring.
  // Same meet-scoped auth as protests.json (super_admin or an official on THIS
  // meet). The desktop is the live meet authority, so its outcome wins.
  router.post('/portal/meet/:meetId/protests/:protestId/remote-ruling', requireRole('judge', 'meet_director'), (req, res) => {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok: false, error: 'Meet not found.' });
    if (!hasRole(req.user, 'super_admin') && !canEditMeet(req.user, meet)) {
      return res.status(403).json({ ok: false, error: 'You are not an official on this meet.' });
    }
    const protest = findProtest(meet, req.params.protestId);
    if (!protest) return res.status(404).json({ ok: false, error: 'Protest not found.' });
    const b = req.body || {};
    let changed = false;
    if (b.state === 'upheld' || b.state === 'denied') {
      protest.state = b.state;
      protest.ruling = String(b.ruling || '').slice(0, 2000);
      protest.ruledByName = String(b.ruledByName || '');
      protest.ruledAt = String(b.ruledAt || '') || nowIso();
      changed = true;
    }
    if (b.feeCollected === true || String(b.feeCollected) === 'true') {
      protest.feeCollected = true;
      protest.feeCollectedBy = String(b.feeCollectedBy || '');
      protest.feeCollectedAt = String(b.feeCollectedAt || '') || nowIso();
      changed = true;
    }
    if (!changed) return res.status(400).json({ ok: false, error: 'No ruling or fee outcome supplied.' });
    // Audit trail: this outcome was decided on the desktop-run meet, mirrored up.
    protest.ruledSource = 'desktop';
    protest.ruledRemotelyAt = nowIso();
    meet.updatedAt = nowIso();
    saveDb(req.db);
    res.json({ ok: true, applied: { id: protest.id, state: protest.state || '', feeCollected: !!protest.feeCollected } });
  });

  // Officials: rule
  router.post('/portal/meet/:meetId/protests/:protestId/rule', requireRole('judge', 'meet_director'), (req, res) => {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet) return res.redirect('/portal');
    const protest = findProtest(meet, req.params.protestId);
    if (!protest) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/protests`);
    const state = req.body.state === 'upheld' ? 'upheld' : req.body.state === 'denied' ? 'denied' : '';
    if (!state) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/protests`);
    protest.state = state;
    protest.ruling = String(req.body.ruling || '').slice(0, 2000);
    protest.ruledByUserId = String(req.user.id || '');
    protest.ruledByName = String(req.user.name || req.user.fullName || req.user.email || '');
    protest.ruledAt = nowIso();
    meet.updatedAt = nowIso();
    saveDb(req.db);
    // v2: mirror this ruling back to the online meet (desktop-run meets only).
    if (protestSync.markRulingForPush(meet, protest)) {
      saveDb(req.db);
      protestSync.flushPendingPushes().catch(() => {});
    }
    // Integration 1: an upheld race-specific protest opens Correction Mode (meet-director
    // only) with the reason prefilled. A judge without edit rights just records the ruling.
    if (state === 'upheld' && protest.raceId && canEditMeet(req.user, meet)) {
      protest.correctionRaceId = protest.raceId;
      saveDb(req.db);
      const reason = `Protest ${protest.id} upheld: ${protest.ruling || protest.statement}`.slice(0, 500);
      return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race-day/correction?raceId=${encodeURIComponent(protest.raceId)}&reason=${encodeURIComponent(reason)}`);
    }
    const flash = state === 'upheld'
      ? (protest.raceId ? `${protest.id} upheld. A meet director can open Correction Mode for the race.` : `${protest.id} upheld.`)
      : `${protest.id} denied.`;
    res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/protests?flash=${encodeURIComponent(flash)}`);
  });

  // Meet director marks the (in-person) protest fee collected. Judges rule; they
  // do not handle money. Non-refundable, so this only flips to collected.
  router.post('/portal/meet/:meetId/protests/:protestId/fee', requireRole('meet_director'), (req, res) => {
    const meet = getMeetOr404(req.db, req.params.meetId);
    if (!meet) return res.redirect('/portal');
    if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');
    const protest = findProtest(meet, req.params.protestId);
    if (!protest) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/protests`);
    protest.feeCollected = true;
    protest.feeCollectedBy = String(req.user.name || req.user.fullName || req.user.email || '');
    protest.feeCollectedAt = nowIso();
    meet.updatedAt = nowIso();
    saveDb(req.db);
    // v2: mirror the fee outcome back to the online meet (desktop-run meets only).
    if (protestSync.markRulingForPush(meet, protest)) {
      saveDb(req.db);
      protestSync.flushPendingPushes().catch(() => {});
    }
    res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/protests?flash=${encodeURIComponent(`Fee for ${protest.id} marked collected.`)}`);
  });

  return router;
};
