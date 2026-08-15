const { esc, cap } = require('../utils/html');

const ENTRY_KEYS = [
  'challengeUp',
  'novice',
  'elite',
  'open',
  'quad',
  'additional',
  'timeTrials',
  'relay2Person',
  'relay3Person',
  'relay4Person',
];

/* Event-category keys that represent a real entry (challengeUp is a modifier,
   not an entry on its own — mirrors services/pricing.js). */
const CATEGORY_KEYS = [
  'novice',
  'elite',
  'open',
  'quad',
  'timeTrials',
  'additional',
  'relay2Person',
  'relay3Person',
  'relay4Person',
];

function sponsorLineHtml(sponsor) {
  const s = String(sponsor || '').trim();
  if (!s) return '';
  return `<div class="sponsor-line">Sponsored by ${esc(s)}</div>`;
}

function entryLabelForRegistration(reg) {
  return ENTRY_KEYS
    .filter(k => reg.options?.[k])
    .map(k => {
      if (k === 'challengeUp') return 'CU';
      if (k === 'additional') return 'Additional';
      if (k === 'relay2Person') return '2 Person Relay';
      if (k === 'relay3Person') return '3 Person Relay';
      if (k === 'relay4Person') return '4 Person Relay';
      return cap(k);
    })
    .join(', ') || '—';
}

function entryChipsHtml(reg) {
  const chips = ENTRY_KEYS
    .filter(k => reg.options?.[k])
    .map(k => {
      if (k === 'challengeUp') return 'CU';
      if (k === 'additional') return 'Additional';
      if (k === 'relay2Person') return '2 Person';
      if (k === 'relay3Person') return '3 Person';
      if (k === 'relay4Person') return '4 Person';
      return cap(k);
    });
  if (!chips.length) return `<span class="reg-entry reg-entry-none">none</span>`;
  return chips.map(c => `<span class="reg-entry">${esc(c)}</span>`).join('');
}

function hasEntries(reg) {
  const opts = reg.options || {};
  if (CATEGORY_KEYS.some(k => opts[k])) return true;
  if (Array.isArray(opts.specialRaceIds) && opts.specialRaceIds.length) return true;
  if (opts.skateability || opts.additionalRace || opts.relays) return true;
  if (Array.isArray(opts.quadRelay2Person) || opts.quadRelay2Person) return true;
  if (opts.quadRelay3Person) return true;
  return false;
}

function money(n) {
  return '$' + Number(n || 0).toFixed(0);
}

function pct(part, whole) {
  const w = Number(whole || 0);
  if (!w) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(part || 0) / w) * 100)));
}

/* Race-blocking / attention issues, all derived from existing fields only. */
function issuesForRegistration(reg, helmetCounts) {
  const list = [];
  const helmet = String(reg.helmetNumber ?? '').trim();
  if (!helmet) {
    list.push({ level: 'block', text: 'No helmet # assigned' });
  } else if ((helmetCounts[helmet] || 0) > 1) {
    list.push({ level: 'block', text: `Helmet #${helmet} is used by ${helmetCounts[helmet]} skaters` });
  }
  if (!hasEntries(reg)) {
    list.push({ level: 'block', text: 'No entries selected' });
  }
  if (!reg.paid) {
    list.push({ level: 'warn', text: `${money(reg.totalCost)} entry fee outstanding` });
  }
  return list;
}

function renderRegisteredView({ meet, isSuperAdmin = false, sslSubmissionSummary = null }) {
  const registrations = meet.registrations || [];
  const divisionOptions = Array.from(new Set(
    registrations
      .map(r => String(r.divisionGroupLabel || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  const sslSummary = sslSubmissionSummary || { pending: 0, total: 0, latestTeam: '', latestAt: '' };
  const sslButtonClass = sslSummary.pending ? 'btn-orange' : 'btn2';
  const sslButtonLabel = sslSummary.pending
    ? `Team Submissions (${esc(sslSummary.pending)})`
    : 'Team Submissions';
  const sslButtonNote = sslSummary.pending
    ? `<span class="ssl-submission-alert">${esc(sslSummary.pending)} new</span>`
    : '';

  /* ── roster maths (display only) ── */
  const helmetCounts = registrations.reduce((acc, r) => {
    const h = String(r.helmetNumber ?? '').trim();
    if (h) acc[h] = (acc[h] || 0) + 1;
    return acc;
  }, {});

  const total = registrations.length;
  const paidCount = registrations.filter(r => r.paid).length;
  const checkedCount = registrations.filter(r => r.checkedIn).length;
  const feesDue = registrations.reduce((s, r) => s + Number(r.totalCost || 0), 0);
  const feesCollected = registrations.filter(r => r.paid).reduce((s, r) => s + Number(r.totalCost || 0), 0);
  const feesOutstanding = feesDue - feesCollected;
  const onSiteUnpaid = registrations.filter(r => r.checkedIn && !r.paid);
  const onSiteUnpaidTotal = onSiteUnpaid.reduce((s, r) => s + Number(r.totalCost || 0), 0);

  const issueMap = new Map();
  registrations.forEach(r => issueMap.set(r.id, issuesForRegistration(r, helmetCounts)));
  const blockingRegs = registrations.filter(r => (issueMap.get(r.id) || []).some(i => i.level === 'block'));
  const attentionRegs = registrations.filter(r => (issueMap.get(r.id) || []).length);
  const readyPct = total ? pct(total - blockingRegs.length, total) : 0;

  const baseFee = Number(meet.baseEntryFee || 0);
  const addFee = Number(meet.additionalRaceFee || 0);
  const feeCaption = baseFee
    ? `${money(baseFee)} base${addFee ? ` + ${money(addFee)} / extra event` : ''}`
    : 'Entry fees as configured in Meet Setup';

  /* ── group rows by division, preserving registration order inside each ── */
  const groupOrder = [];
  const grouped = new Map();
  registrations.forEach(r => {
    const key = String(r.divisionGroupLabel || '').trim() || 'No division assigned';
    if (!grouped.has(key)) { grouped.set(key, []); groupOrder.push(key); }
    grouped.get(key).push(r);
  });
  groupOrder.sort((a, b) => a.localeCompare(b));

  const skaterRow = (r) => {
    const issues = issueMap.get(r.id) || [];
    const blocking = issues.some(i => i.level === 'block');
    const helmet = String(r.helmetNumber ?? '').trim();
    const rowClass = [
      'registered-row',
      blocking ? 'is-blocking' : '',
      !r.paid && !blocking ? 'is-unpaid' : '',
    ].filter(Boolean).join(' ');

    const noteHtml = issues.length
      ? `<div class="reg-flags">${issues.map(i => `<span class="reg-flag ${i.level === 'block' ? 'reg-flag-block' : 'reg-flag-warn'}">${esc(i.text)}</span>`).join('')}</div>`
      : '';

    return `
    <tr class="${rowClass}"
      data-name="${esc(String(r.name || '').toLowerCase())}"
      data-team="${esc(String(r.team || '').toLowerCase())}"
      data-division="${esc(String(r.divisionGroupLabel || '').toLowerCase())}"
      data-paid="${r.paid ? 'paid' : 'unpaid'}"
      data-checkin="${r.checkedIn ? 'checked' : 'not-checked'}"
      data-attention="${issues.length ? 'attention' : 'ok'}"
      data-group="${esc(String(r.divisionGroupLabel || '').trim().toLowerCase() || 'no division assigned')}">
      <td data-label="#" class="reg-num">${esc(r.meetNumber)}</td>
      <td data-label="Helmet"><span class="reg-helmet${helmet ? '' : ' reg-helmet-missing'}">${helmet ? esc(helmet) : '—'}</span></td>
      <td data-label="Name">
        <div class="reg-name">${esc(r.name)}</div>
        ${sponsorLineHtml(r.sponsor || '')}
        ${r.options?.challengeUp ? `<div class="reg-challenge">Challenge: ${esc(r.options?.novice ? 'Elite in own division' : (r.challengeDivisionGroupLabel || '—'))}</div>` : ''}
        ${noteHtml}
      </td>
      <td data-label="Age" class="reg-age">${esc(r.age)}</td>
      <td data-label="Team" class="reg-team">${esc(r.team)}</td>
      <td data-label="Division" class="reg-division-cell">${esc(r.divisionGroupLabel || '')}</td>
      <td data-label="Entries"><div class="reg-entries" title="${esc(entryLabelForRegistration(r))}">${entryChipsHtml(r)}</div></td>
      <td data-label="Total" class="reg-total">$${esc(r.totalCost)}</td>
      <td data-label="Paid">${r.paid
        ? `<span class="reg-pill reg-pill-good">✔ Paid</span>`
        : `<span class="reg-pill reg-pill-warn">Unpaid</span>`}</td>
      <td data-label="In">${r.checkedIn
        ? `<span class="reg-pill reg-pill-good">✔ In</span>`
        : `<span class="reg-pill reg-pill-idle">—</span>`}</td>
      <td data-label="">
        <div class="action-row reg-actions">
          <a class="btn2 btn-sm" href="/portal/meet/${meet.id}/registered/${r.id}/edit">Edit</a>
          <a class="btn-danger btn-sm" href="/portal/meet/${meet.id}/registered/${r.id}/delete">Del</a>
        </div>
      </td>
    </tr>`;
  };

  const bodyHtml = groupOrder.map(label => {
    const regs = grouped.get(label) || [];
    const groupIssues = regs.filter(r => (issueMap.get(r.id) || []).some(i => i.level === 'block')).length;
    const groupDue = regs.filter(r => !r.paid).reduce((s, r) => s + Number(r.totalCost || 0), 0);
    const key = esc(label.toLowerCase());
    const meta = [
      `${regs.length} skater${regs.length === 1 ? '' : 's'}`,
      `${regs.filter(r => r.checkedIn).length} checked in`,
      groupDue ? `${money(groupDue)} due` : '',
    ].filter(Boolean).join(' · ');

    return `
      <tr class="reg-group-row" data-group-header="${key}">
        <td colspan="11">
          <div class="reg-group">
            <span class="reg-group-name">${esc(label)}</span>
            <span class="reg-group-meta">${esc(meta)}</span>
            ${groupIssues
              ? `<span class="reg-pill reg-pill-bad">${groupIssues} to fix</span>`
              : `<span class="reg-pill reg-pill-good">Ready</span>`}
          </div>
        </td>
      </tr>
      ${regs.map(skaterRow).join('')}`;
  }).join('');

  return `
    <style>
      .ssl-submission-alert{
        display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:9px 12px;
        background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-weight:900;font-size:12px;
        text-transform:uppercase;letter-spacing:.04em;
      }
      .ssl-submission-alert:before{content:'●';color:#f97316;font-size:14px;line-height:1;}

      /* ── command band ── */
      .reg-band{
        display:grid;grid-template-columns:1.1fr 1.5fr 1.1fr 1.2fr;gap:16px;
        padding:20px 22px;margin-bottom:16px;border-radius:var(--radius-lg);color:#fff;
        background:linear-gradient(135deg, var(--navy) 0%, var(--navy2) 58%, var(--navy) 100%);
        box-shadow:var(--shadow-lg);
      }
      .reg-band-cell{display:flex;flex-direction:column;gap:8px;min-width:0;}
      .reg-band-cell + .reg-band-cell{padding-left:22px;border-left:1px solid rgba(255,255,255,.14);}
      .reg-band-label{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;}
      .reg-band-label.sky{color:var(--sky);}
      .reg-band-label.orange{color:var(--orange);}
      .reg-band-label.red{color:#fca5a5;}
      .reg-band-label.dim{color:rgba(255,255,255,.62);}
      .reg-band-value{display:flex;align-items:baseline;gap:9px;}
      .reg-band-value b{font-size:34px;font-weight:800;letter-spacing:-.03em;line-height:1;}
      .reg-band-value span{font-size:14px;font-weight:600;color:rgba(255,255,255,.62);}
      .reg-band-value strong{font-size:20px;font-weight:800;}
      .reg-band-note{font-size:12px;font-weight:600;color:rgba(255,255,255,.62);}
      .reg-band-note.amber{color:#fdba74;font-weight:800;}
      .reg-band-foot{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;}
      .reg-meter{height:7px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden;}
      .reg-meter i{display:block;height:100%;border-radius:4px;}
      .reg-meter i.sky{background:var(--sky);}
      .reg-meter i.green{background:var(--green);}
      .reg-band-actions{display:flex;flex-direction:column;gap:8px;margin-top:2px;}
      .reg-band-actions .btn-ghost{
        display:inline-flex;align-items:center;justify-content:center;gap:6px;
        padding:9px 16px;border-radius:var(--radius-sm);font-weight:700;font-size:13px;
        background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);color:#fff;
        text-decoration:none;cursor:pointer;
      }
      .reg-band-actions .btn-ghost:hover{background:rgba(255,255,255,.18);color:#fff;}
      .reg-band-list{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:rgba(255,255,255,.72);}

      /* ── toolbar ── */
      .reg-toolbar{display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px;margin-bottom:14px;}
      .reg-toolbar .reg-field{flex:1 1 170px;min-width:150px;}
      .reg-toolbar .reg-field.narrow{flex:0 1 140px;}
      .reg-quick{display:flex;gap:8px;flex-wrap:wrap;padding-bottom:1px;}
      .reg-chip-btn{
        padding:9px 14px;border-radius:var(--radius-sm);font-weight:700;font-size:12.5px;
        border:1.5px solid var(--border2);background:#fff;color:var(--navy);cursor:pointer;transition:all .15s;
      }
      .reg-chip-btn:hover{box-shadow:var(--shadow);transform:translateY(-1px);}
      .reg-chip-btn.bad{background:#fef2f2;border-color:#fca5a5;color:#b42318;}
      .reg-chip-btn.warn{background:#fff7ed;border-color:#fed7aa;color:var(--orange2);}
      .reg-chip-btn.is-on{background:var(--navy);border-color:var(--navy);color:#fff;}

      /* ── table ── */
      .reg-table-wrap{overflow-x:auto;border-radius:var(--radius);border:1px solid var(--border);}
      table.reg-table{width:100%;border-collapse:collapse;background:var(--card);}
      .reg-table th{
        font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);
        font-weight:700;padding:12px 14px;border-bottom:1px solid rgba(15,31,61,.08);
        text-align:left;background:var(--panel);white-space:nowrap;
      }
      .reg-table td{padding:11px 14px;border-bottom:1px solid var(--border);vertical-align:middle;}
      .reg-table tbody tr.registered-row{border-left:3px solid transparent;}
      .reg-table tbody tr.registered-row:hover{background:#fff;}
      .reg-table tbody tr.is-blocking{background:rgba(239,68,68,.045);border-left-color:var(--red);}
      .reg-table tbody tr.is-unpaid{background:rgba(249,115,22,.05);border-left-color:var(--orange);}
      .reg-group-row td{padding:0;border-bottom:1px solid rgba(15,31,61,.08);background:var(--off);}
      .reg-group{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 14px;}
      .reg-group-name{font-size:15px;font-weight:800;letter-spacing:-.02em;color:var(--navy);}
      .reg-group-meta{font-size:12.5px;font-weight:500;color:var(--muted);}
      .reg-num{font-size:12.5px;font-weight:700;color:var(--muted);}
      .reg-helmet{
        display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:32px;
        padding:0 8px;border-radius:var(--radius-sm);background:var(--navy);color:#fff;
        font-size:17px;font-weight:800;letter-spacing:-.02em;
      }
      .reg-helmet-missing{background:#fef2f2;border:1.5px dashed #fca5a5;color:var(--red);font-size:15px;}
      .reg-name{font-size:14px;font-weight:700;color:var(--navy);}
      .reg-challenge{font-size:11px;font-weight:600;color:var(--muted);margin-top:3px;}
      .reg-age,.reg-team,.reg-division-cell{font-size:13px;color:var(--navy);}
      .reg-age{color:var(--muted);font-weight:600;}
      .reg-total{font-size:14px;font-weight:800;color:var(--navy);white-space:nowrap;}
      .reg-entries{display:flex;flex-wrap:wrap;gap:4px;max-width:230px;}
      .reg-entry{
        display:inline-flex;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;
        background:#f0f9ff;border:1px solid #bae6fd;color:var(--sky2);white-space:nowrap;
      }
      .reg-entry-none{background:#fef2f2;border-color:#fca5a5;color:var(--red);}
      .reg-pill{
        display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;
        font-size:11.5px;font-weight:700;white-space:nowrap;border:1px solid var(--border2);
        background:#fff;color:var(--muted);
      }
      .reg-pill-good{background:#ecfdf5;border-color:#6ee7b7;color:#047857;}
      .reg-pill-warn{background:#fff7ed;border-color:#fed7aa;color:var(--orange2);}
      .reg-pill-bad{background:#fef2f2;border-color:#fca5a5;color:#b42318;}
      .reg-flags{display:flex;flex-direction:column;gap:2px;margin-top:5px;}
      .reg-flag{font-size:11.5px;font-weight:650;}
      .reg-flag:before{content:'⚠ ';}
      .reg-flag-block{color:#b42318;}
      .reg-flag-warn{color:var(--orange2);}
      .reg-actions{justify-content:flex-end;gap:6px;flex-wrap:nowrap;}

      @media(max-width:1180px){
        .reg-band{grid-template-columns:1fr 1fr;}
        .reg-band-cell + .reg-band-cell{padding-left:0;border-left:0;}
        .reg-band-cell:nth-child(n+3){padding-top:16px;border-top:1px solid rgba(255,255,255,.14);}
      }
      @media(max-width:900px){
        .ssl-submission-alert{width:100%;justify-content:center;}
        .reg-band{grid-template-columns:1fr;padding:16px;}
        .reg-band-cell:nth-child(n+2){padding-top:14px;border-top:1px solid rgba(255,255,255,.14);}
        .reg-band-value b{font-size:30px;}
        .reg-toolbar .reg-field{flex:1 1 100%;}
        .reg-quick{width:100%;}
        .reg-chip-btn{flex:1 1 auto;min-height:44px;}

        /* table → stacked cards */
        .reg-table-wrap{overflow:visible;border:0;border-radius:0;}
        .reg-table{background:transparent;}
        .reg-table thead{display:none;}
        .reg-table tbody,.reg-table tr,.reg-table td{display:block;width:100%;}
        .reg-table tbody tr.reg-group-row{margin:14px 0 8px;}
        .reg-group-row td{border:0;background:transparent;}
        .reg-group{padding:0;}
        .reg-table tbody tr.registered-row{
          background:#fff;border:1px solid var(--border);border-left:3px solid transparent;
          border-radius:var(--radius);box-shadow:var(--shadow-sm);padding:12px 14px;margin-bottom:10px;
        }
        .reg-table tbody tr.registered-row td{
          border:0;padding:3px 0;display:flex;align-items:center;justify-content:space-between;gap:12px;
        }
        .reg-table tbody tr.registered-row td:before{
          content:attr(data-label);flex:0 0 auto;font-size:11px;font-weight:700;
          letter-spacing:.06em;text-transform:uppercase;color:var(--muted);
        }
        .reg-table tbody tr.registered-row td[data-label="Name"]{display:block;padding:6px 0 8px;}
        .reg-table tbody tr.registered-row td[data-label="Name"]:before{display:none;}
        .reg-table tbody tr.registered-row td[data-label=""]{padding-top:10px;margin-top:6px;border-top:1px solid var(--border);}
        .reg-table tbody tr.registered-row td[data-label=""]:before{display:none;}
        .reg-entries{max-width:none;justify-content:flex-end;}
        .reg-actions{width:100%;justify-content:stretch;}
        .reg-actions .btn-sm{flex:1;min-height:44px;display:flex;align-items:center;justify-content:center;font-size:14px;}
      }
    </style>

    <div class="page-header">
      <h1>Registered</h1>
      <div class="sub">${esc(meet.meetName)} • <span id="registeredVisibleCount">${total}</span> of ${total} skaters${meet.registrationCloseAt ? ` • registration closes ${esc(meet.registrationCloseAt.replace('T', ' '))}` : ''}</div>
    </div>

    <div class="reg-band">
      <div class="reg-band-cell">
        <div class="reg-band-label sky">Checked in</div>
        <div class="reg-band-value"><b>${checkedCount}</b><span>of ${total}</span></div>
        <div class="reg-meter"><i class="sky" style="width:${pct(checkedCount, total)}%"></i></div>
        <div class="reg-band-note">${Math.max(0, total - checkedCount)} skater${total - checkedCount === 1 ? '' : 's'} still to arrive</div>
      </div>

      <div class="reg-band-cell">
        <div class="reg-band-label orange">Entry fees collected</div>
        <div class="reg-band-value"><b>${money(feesCollected)}</b><span>of</span><strong>${money(feesDue)}</strong></div>
        <div class="reg-meter"><i class="green" style="width:${pct(feesCollected, feesDue)}%"></i></div>
        <div class="reg-band-foot">
          <span class="reg-band-note">${paidCount} of ${total} paid • ${esc(feeCaption)}</span>
          ${feesOutstanding > 0 ? `<span class="reg-band-note amber">${money(feesOutstanding)} outstanding</span>` : `<span class="reg-band-note amber">All entries paid</span>`}
        </div>
      </div>

      <div class="reg-band-cell">
        <div class="reg-band-label red">Needs attention</div>
        <div class="reg-band-value"><b>${attentionRegs.length}</b><span>${blockingRegs.length} block races</span></div>
        <div class="reg-band-list">
          <span>${blockingRegs.length} helmet / entry problem${blockingRegs.length === 1 ? '' : 's'}</span>
          <span>${onSiteUnpaid.length} checked in still owing ${money(onSiteUnpaidTotal)}</span>
        </div>
      </div>

      <div class="reg-band-cell">
        <div class="reg-band-label dim">Ready for race generation</div>
        <div class="reg-band-value"><b>${readyPct}%</b><span>${blockingRegs.length} blocker${blockingRegs.length === 1 ? '' : 's'}</span></div>
        <div class="reg-band-actions">
          <form method="POST" action="/portal/meet/${meet.id}/assign-races" onsubmit="return confirm('Rebuild will re-split heats and reassign lanes.\n\nYour block structure will be preserved but lane assignments will change.\n\nContinue?')"><button class="btn-orange" type="submit" style="width:100%">Rebuild Assignments</button></form>
          <a class="btn-ghost" href="/portal/ssl-packages?meetId=${encodeURIComponent(meet.id)}">${sslButtonLabel}</a>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:18px">
        <div class="note">Registration close: ${meet.registrationCloseAt ? esc(meet.registrationCloseAt.replace('T', ' ')) : 'Not set'}</div>
        <div class="action-row">
          <a class="${sslButtonClass}" href="/portal/ssl-packages?meetId=${encodeURIComponent(meet.id)}">${sslButtonLabel}</a>
          ${sslButtonNote}
          <a class="btn-orange" href="/meet/${meet.id}/register" target="_blank">Public Registration</a>
          ${isSuperAdmin ? `<a class="btn2" href="/portal/meet/${meet.id}/dev/import-spring-fling">Dev Import</a>` : ''}
          <a class="btn2" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
        </div>
      </div>

      <div class="reg-toolbar">
        <div class="reg-field">
          <label>Search Name</label>
          <input id="registeredNameSearch" type="text" placeholder="skater name..." autocomplete="off" />
        </div>
        <div class="reg-field">
          <label>Team</label>
          <input id="registeredTeamSearch" type="text" placeholder="team..." autocomplete="off" />
        </div>
        <div class="reg-field">
          <label>Division</label>
          <select id="registeredDivisionFilter">
            <option value="">All</option>
            ${divisionOptions.map(d => `<option value="${esc(d.toLowerCase())}">${esc(d)}</option>`).join('')}
          </select>
        </div>
        <div class="reg-field narrow">
          <label>Payment</label>
          <select id="registeredPaidFilter">
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
        <div class="reg-field narrow">
          <label>Check-In</label>
          <select id="registeredCheckinFilter">
            <option value="">All</option>
            <option value="checked">Checked In</option>
            <option value="not-checked">Not Checked In</option>
          </select>
        </div>
        <div class="reg-quick">
          <button type="button" class="reg-chip-btn bad" id="registeredAttentionToggle" aria-pressed="false">Needs attention · ${attentionRegs.length}</button>
          <button type="button" class="reg-chip-btn" id="registeredClearFilters">Clear</button>
        </div>
      </div>

      <div class="reg-table-wrap">
        <table class="table reg-table">
          <thead><tr><th>#</th><th>Helmet</th><th>Name</th><th>Age</th><th>Team</th><th>Division</th><th>Entries</th><th>Total</th><th>Paid</th><th>In</th><th></th></tr></thead>
          <tbody id="registeredTableBody">${bodyHtml || `<tr><td colspan="11" class="muted">No registrations yet.</td></tr>`}</tbody>
        </table>
        <div id="registeredNoMatches" class="muted" style="display:none;padding:14px 0">No registrations match those filters.</div>
      </div>
    </div>
    <script>
      (function(){
        var nameInput = document.getElementById('registeredNameSearch');
        var teamInput = document.getElementById('registeredTeamSearch');
        var divisionFilter = document.getElementById('registeredDivisionFilter');
        var paidFilter = document.getElementById('registeredPaidFilter');
        var checkinFilter = document.getElementById('registeredCheckinFilter');
        var countEl = document.getElementById('registeredVisibleCount');
        var noMatches = document.getElementById('registeredNoMatches');
        var attentionToggle = document.getElementById('registeredAttentionToggle');
        var clearBtn = document.getElementById('registeredClearFilters');
        var attentionOnly = false;

        function val(el){ return String((el && el.value) || '').trim().toLowerCase(); }

        function applyRegisteredFilters(){
          var nameQ = val(nameInput);
          var teamQ = val(teamInput);
          var divisionQ = val(divisionFilter);
          var paidQ = val(paidFilter);
          var checkinQ = val(checkinFilter);
          var rows = Array.from(document.querySelectorAll('.registered-row'));
          var visible = 0;
          var groupsWithRows = {};

          rows.forEach(function(row){
            var ok = true;
            if(nameQ && !String(row.dataset.name || '').includes(nameQ)) ok = false;
            if(teamQ && !String(row.dataset.team || '').includes(teamQ)) ok = false;
            if(divisionQ && String(row.dataset.division || '') !== divisionQ) ok = false;
            if(paidQ && String(row.dataset.paid || '') !== paidQ) ok = false;
            if(checkinQ && String(row.dataset.checkin || '') !== checkinQ) ok = false;
            if(attentionOnly && String(row.dataset.attention || '') !== 'attention') ok = false;

            row.style.display = ok ? '' : 'none';
            if(ok){ visible += 1; groupsWithRows[String(row.dataset.group || '')] = true; }
          });

          Array.from(document.querySelectorAll('[data-group-header]')).forEach(function(header){
            var key = String(header.getAttribute('data-group-header') || '');
            header.style.display = groupsWithRows[key] ? '' : 'none';
          });

          if(countEl) countEl.textContent = visible;
          if(noMatches) noMatches.style.display = rows.length && !visible ? '' : 'none';
        }

        [nameInput, teamInput, divisionFilter, paidFilter, checkinFilter].forEach(function(el){
          if(!el) return;
          el.addEventListener('input', applyRegisteredFilters);
          el.addEventListener('change', applyRegisteredFilters);
        });

        if(attentionToggle){
          attentionToggle.addEventListener('click', function(){
            attentionOnly = !attentionOnly;
            attentionToggle.classList.toggle('is-on', attentionOnly);
            attentionToggle.setAttribute('aria-pressed', attentionOnly ? 'true' : 'false');
            applyRegisteredFilters();
          });
        }

        if(clearBtn){
          clearBtn.addEventListener('click', function(){
            if(nameInput) nameInput.value = '';
            if(teamInput) teamInput.value = '';
            if(divisionFilter) divisionFilter.value = '';
            if(paidFilter) paidFilter.value = '';
            if(checkinFilter) checkinFilter.value = '';
            attentionOnly = false;
            if(attentionToggle){
              attentionToggle.classList.remove('is-on');
              attentionToggle.setAttribute('aria-pressed', 'false');
            }
            applyRegisteredFilters();
          });
        }

        applyRegisteredFilters();
      })();
    </script>`;
}

module.exports = {
  renderRegisteredView,
};
