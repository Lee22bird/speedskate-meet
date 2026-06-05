const express = require('express');
const crypto = require('crypto');
const { esc } = require('../utils/html');
const { nowIso } = require('../utils/date');

function ensurePackageStore(db) {
  if (!Array.isArray(db.sslRegistrationPackages)) db.sslRegistrationPackages = [];
  return db.sslRegistrationPackages;
}

function safePackageId() {
  return 'ssl_pkg_' + crypto.randomBytes(6).toString('hex');
}

function parsePackage(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Paste an SSL registration package JSON export first.');
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error('That is not valid JSON. Export the package from SSL again and paste the full file contents.');
  }

  if (payload.package_type !== 'ssl_team_registration_package') {
    throw new Error('This does not look like an SSL team registration package.');
  }
  if (!payload.team) throw new Error('Package is missing team name.');
  if (!payload.meet || !payload.meet.title) throw new Error('Package is missing meet details.');
  if (!Array.isArray(payload.skaters)) throw new Error('Package is missing the skaters array.');

  return payload;
}

function eventList(row) {
  const names = Array.isArray(row?.selected_event_names) ? row.selected_event_names : [];
  return names.length ? names.join(', ') : 'No events selected';
}

function renderPackageCard(pkg, selectedId) {
  const payload = pkg.payload || {};
  const meet = payload.meet || {};
  const counts = payload.counts || {};
  const isSelected = String(pkg.id) === String(selectedId || '');
  return `
    <a class="ssl-package-row${isSelected ? ' active' : ''}" href="/portal/ssl-packages?id=${esc(pkg.id)}">
      <div>
        <div class="ssl-package-title">${esc(meet.title || 'SSL Registration Package')}</div>
        <div class="ssl-package-meta">${esc(payload.team || 'Team')} • ${esc(meet.date || 'Date TBD')} ${meet.location ? '• ' + esc(meet.location) : ''}</div>
      </div>
      <div class="ssl-package-count">${esc(counts.ready ?? (payload.skaters || []).length)} ready</div>
    </a>`;
}

function renderPackagePreview(pkg) {
  if (!pkg) {
    return `<div class="card ssl-import-empty"><h2>No package selected</h2><p class="muted">Import an SSL package or select one from the list.</p></div>`;
  }

  const payload = pkg.payload || {};
  const meet = payload.meet || {};
  const counts = payload.counts || {};
  const warnings = payload.warnings || {};
  const skaters = Array.isArray(payload.skaters) ? payload.skaters : [];
  const missingEvents = Array.isArray(warnings.missing_events) ? warnings.missing_events : [];
  const noResponse = Array.isArray(warnings.no_response) ? warnings.no_response : [];

  const rows = skaters.map(row => `
    <tr>
      <td><b>${esc(row.full_name || 'Skater')}</b><div class="muted small">SSL ID: ${esc(row.ssl_user_id || '')}</div></td>
      <td>${esc(row.helmet_number || '—')}</td>
      <td>${esc(row.age_group || '—')}</td>
      <td>${esc(eventList(row))}</td>
    </tr>`).join('');

  const warningHtml = [
    missingEvents.length ? `<div class="ssl-warning"><b>Missing events:</b> ${missingEvents.map(r => esc(r.full_name || 'Skater')).join(', ')}</div>` : '',
    noResponse.length ? `<div class="ssl-warning"><b>No response:</b> ${noResponse.slice(0, 8).map(r => esc(r.full_name || 'Skater')).join(', ')}${noResponse.length > 8 ? ' +' + esc(noResponse.length - 8) + ' more' : ''}</div>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="card ssl-package-preview">
      <div class="row between center" style="margin-bottom:14px">
        <div>
          <div class="muted small">SSL Registration Package</div>
          <h2 style="margin:0">${esc(meet.title || 'Meet')}</h2>
          <div class="muted">${esc(payload.team || 'Team')} • ${esc(meet.date || 'Date TBD')} ${meet.location ? '• ' + esc(meet.location) : ''}</div>
        </div>
        <span class="chip chip-sky">Pending Review</span>
      </div>

      <div class="ssl-import-stats">
        <div><b>${esc(counts.ready ?? skaters.length)}</b><span>Ready</span></div>
        <div><b>${esc(counts.missing_events || 0)}</b><span>Missing Events</span></div>
        <div><b>${esc(counts.no_response || 0)}</b><span>No Response</span></div>
        <div><b>${esc(payload.package_id || pkg.id)}</b><span>Package ID</span></div>
      </div>

      ${warningHtml || `<div class="good" style="margin-bottom:14px">No package warnings found.</div>`}

      <table class="table">
        <thead><tr><th>Skater</th><th>Helmet</th><th>Division</th><th>Events</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4">No ready skaters in this package.</td></tr>`}</tbody>
      </table>

      <div class="hr"></div>
      <div class="muted small">Imported ${esc(pkg.createdAt || '')} by ${esc(pkg.createdBy || 'SSM user')}. Auto-create registrations is intentionally disabled in this first bridge pass.</div>
    </div>`;
}

function renderSslPackagePage({ db, user, selectedId, error, ok }) {
  const packages = ensurePackageStore(db).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const selected = packages.find(p => String(p.id) === String(selectedId || '')) || packages[0] || null;

  return `
    <style>
      .ssl-import-grid{display:grid;grid-template-columns:390px minmax(0,1fr);gap:16px;align-items:start;}
      .ssl-package-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;border:1px solid var(--border);border-radius:14px;background:#fff;color:inherit;text-decoration:none;margin-bottom:8px;}
      .ssl-package-row:hover,.ssl-package-row.active{border-color:var(--sky2);box-shadow:var(--shadow-sm);}
      .ssl-package-title{font-weight:850;color:var(--navy);line-height:1.15;}
      .ssl-package-meta{font-size:12px;color:var(--muted);margin-top:3px;}
      .ssl-package-count{font-size:12px;font-weight:900;color:var(--sky2);white-space:nowrap;}
      .ssl-import-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px;}
      .ssl-import-stats div{border:1px solid var(--border);border-radius:14px;background:#f8fafc;padding:12px;}
      .ssl-import-stats b{display:block;font-size:20px;color:var(--navy);line-height:1.1;word-break:break-word;}
      .ssl-import-stats span{font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:800;color:var(--muted);}
      .ssl-warning{border:1px solid #fed7aa;background:#fff7ed;color:#9a3412;border-radius:14px;padding:11px 13px;margin-bottom:10px;font-weight:700;}
      .ssl-import-empty{text-align:center;padding:40px;}
      @media(max-width:920px){.ssl-import-grid{grid-template-columns:1fr}.ssl-import-stats{grid-template-columns:1fr 1fr;}}
    </style>
    <div class="page-header"><h1>SSL Registration Packages</h1><div class="sub">Review team registration packages exported from SpeedSkateLeague before creating SSM registrations.</div></div>
    ${error ? `<div class="card" style="border-left:4px solid var(--red);margin-bottom:12px"><div class="danger">${esc(error)}</div></div>` : ''}
    ${ok ? `<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">${esc(ok)}</div></div>` : ''}
    <div class="ssl-import-grid">
      <div class="stack">
        <div class="card">
          <h2>Import Package JSON</h2>
          <p class="muted">From SSL, click <b>Export JSON</b>, copy the file contents, then paste it here.</p>
          <form method="POST" action="/portal/ssl-packages/import">
            <textarea name="packageJson" rows="10" placeholder='{"package_type":"ssl_team_registration_package",...}'></textarea>
            <div class="action-row" style="margin-top:10px"><button class="btn-orange" type="submit">Import Package</button></div>
          </form>
        </div>
        <div class="card">
          <h2>Incoming Packages</h2>
          ${packages.length ? packages.map(p => renderPackageCard(p, selected?.id)).join('') : `<div class="muted">No SSL packages imported yet.</div>`}
        </div>
      </div>
      ${renderPackagePreview(selected)}
    </div>`;
}

module.exports = function createSslImportRoutes(deps = {}) {
  const router = express.Router();
  const { requireRole, pageShell, saveDb } = deps;

  router.get('/portal/ssl-packages', requireRole('meet_director'), (req, res) => {
    res.send(pageShell({
      title: 'SSL Registration Packages',
      user: req.user,
      bodyHtml: renderSslPackagePage({
        db: req.db,
        user: req.user,
        selectedId: req.query.id,
        error: req.query.error,
        ok: req.query.ok,
      }),
    }));
  });

  router.post('/portal/ssl-packages/import', requireRole('meet_director'), (req, res) => {
    try {
      const payload = parsePackage(req.body.packageJson);
      const packages = ensurePackageStore(req.db);
      const existing = packages.find(p => String(p.payload?.package_id || '') === String(payload.package_id || '') && String(p.payload?.team || '') === String(payload.team || ''));
      if (existing) {
        existing.payload = payload;
        existing.updatedAt = nowIso();
        existing.updatedByUserId = req.user.id;
        saveDb(req.db);
        return res.redirect('/portal/ssl-packages?id=' + encodeURIComponent(existing.id) + '&ok=' + encodeURIComponent('Existing SSL package updated.'));
      }

      const row = {
        id: safePackageId(),
        status: 'pending',
        createdAt: nowIso(),
        createdByUserId: req.user.id,
        createdBy: req.user.displayName || req.user.username || 'SSM User',
        payload,
      };
      packages.unshift(row);
      saveDb(req.db);
      return res.redirect('/portal/ssl-packages?id=' + encodeURIComponent(row.id) + '&ok=' + encodeURIComponent('SSL package imported for review.'));
    } catch (err) {
      return res.redirect('/portal/ssl-packages?error=' + encodeURIComponent(err.message));
    }
  });

  return router;
};
