const { esc, cap } = require('../utils/html');

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(0) : '0';
}

function entryChipsForRegistration(reg) {
  const opts = reg?.options || {};
  return [
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
  ]
    .filter(k => opts[k])
    .map(k => {
      if (k === 'challengeUp') return 'CU';
      if (k === 'additional') return 'Additional';
      if (k === 'timeTrials') return 'Time Trials';
      if (k === 'relay2Person') return '2 Person Relay';
      if (k === 'relay3Person') return '3 Person Relay';
      if (k === 'relay4Person') return '4 Person Relay';
      return cap(k);
    });
}

function renderCheckinView({ meet, query = {} }) {
  const registrations = meet.registrations || [];
  const totalOwed = registrations.reduce((sum, r) => sum + Number(r.totalCost || 0), 0);
  const totalPaid = registrations.filter(r => r.paid).reduce((sum, r) => sum + Number(r.totalCost || 0), 0);
  const checkedInCount = registrations.filter(r => r.checkedIn).length;
  const total = registrations.length;
  const remaining = total - checkedInCount;
  const pct = total ? Math.round((checkedInCount / total) * 100) : 0;

  // Helmet numbers used more than once block the start line.
  const helmetCounts = registrations.reduce((acc, r) => {
    const h = String(r.helmetNumber || '').trim();
    if (h) acc[h] = (acc[h] || 0) + 1;
    return acc;
  }, {});

  const analyzed = registrations.map(r => {
    const helmet = String(r.helmetNumber || '').trim();
    const cost = Number(r.totalCost || 0);
    const noHelmet = !helmet;
    const dupHelmet = !!helmet && helmetCounts[helmet] > 1;
    const unpaid = !r.paid;
    const issues = [];
    if (noHelmet) issues.push('No helmet # assigned');
    if (dupHelmet) issues.push(`Helmet #${helmet} is a duplicate`);
    if (unpaid) issues.push(`$${money(cost)} due`);
    return { reg: r, helmet, cost, noHelmet, dupHelmet, unpaid, issues, ready: issues.length === 0 };
  });

  const attentionList = analyzed.filter(a => !a.ready);
  const unpaidCount = analyzed.filter(a => a.unpaid).length;
  const noHelmetCount = analyzed.filter(a => a.noHelmet).length;

  const flash = [
    query.checkedIn ? `Checked in ${decodeURIComponent(query.checkedIn)} skater(s).` : '',
    query.paid ? `Marked ${decodeURIComponent(query.paid)} skater(s) paid.` : '',
    query.helmetUpdated ? 'Helmet number updated.' : '',
  ].filter(Boolean).map(msg => `
    <div class="ci-flash">✅ ${esc(msg)}</div>`).join('');

  // Needs-attention first, then not-checked-in, then the rest — the line moves top-down.
  const sorted = analyzed.slice().sort((a, b) => {
    const rank = x => (!x.ready ? 0 : (!x.reg.checkedIn ? 1 : 2));
    return rank(a) - rank(b);
  });

  const cards = sorted.map(a => {
    const r = a.reg;
    const chips = entryChipsForRegistration(r);
    const entryChips = chips.length
      ? chips.map(c => `<span class="ci-chip">${esc(c)}</span>`).join('')
      : '<span class="ci-chip ci-chip-warn">No entries</span>';

    const statusClass = a.ready ? 'ci-status ci-status-ready' : 'ci-status ci-status-attn';
    const statusLabel = a.ready ? '✔ Ready to race' : '⚠ Needs attention';

    return `
      <div class="checkin-card"
        data-name="${esc(String(r.name || '').toLowerCase())}"
        data-team="${esc(String(r.team || '').toLowerCase())}"
        data-meet-number="${esc(String(r.meetNumber || '').toLowerCase())}"
        data-helmet="${esc(String(r.helmetNumber || '').toLowerCase())}"
        data-paid="${r.paid ? 'paid' : 'unpaid'}"
        data-checkin="${r.checkedIn ? 'checked' : 'not-checked'}"
        data-nohelmet="${a.noHelmet ? 'yes' : 'no'}"
        data-attention="${a.ready ? 'ok' : 'attention'}"
        data-reg-id="${esc(r.id)}">

        <div class="ci-identity">
          <div class="ci-helmet ${a.noHelmet ? 'is-missing' : ''}">${esc(a.helmet || '?')}</div>
          <div class="ci-who">
            <div class="ci-nameline">
              <span class="ci-name">${esc(r.name)}</span>
              <span class="ci-regnum">#${esc(r.meetNumber || '—')}</span>
              <span class="${statusClass}">${statusLabel}</span>
            </div>
            ${r.sponsor ? `<div class="ci-sponsor">Sponsored by ${esc(r.sponsor)}</div>` : ''}
            <div class="ci-meta">${esc(r.team || 'Independent')} · ${esc(r.divisionGroupLabel || 'Unassigned')}</div>
            <div class="ci-chips">
              <span class="ci-chip ci-chip-team">${esc(r.team || 'Independent')}</span>
              <span class="ci-chip">${esc(r.divisionGroupLabel || 'Unassigned')}</span>
              ${entryChips}
              <span class="ci-chip ci-chip-cost">$${esc(money(r.totalCost))} total</span>
            </div>
            ${a.issues.length ? `<div class="ci-issues">⚠ ${esc(a.issues.join(' · '))}</div>` : ''}
          </div>

          <div class="ci-helmet-edit">
            <form method="POST" action="/portal/meet/${esc(meet.id)}/checkin/helmet/${esc(r.id)}?returnTo=checkin" class="checkin-form ci-helmet-form">
              <label>Helmet #</label>
              <div class="ci-helmet-row">
                <input name="helmetNumber" value="${esc(r.helmetNumber || '')}" inputmode="numeric" autocomplete="off" />
                <button class="ci-save" type="submit">Save</button>
              </div>
            </form>
            <a class="ci-edit-link" href="/portal/meet/${esc(meet.id)}/registered/${esc(r.id)}/edit">Edit registration</a>
          </div>
        </div>

        <div class="ci-actions">
          <form method="POST" action="/portal/meet/${esc(meet.id)}/checkin/toggle-paid/${esc(r.id)}?returnTo=checkin" class="checkin-form">
            <button class="ci-btn ci-btn-paid ${r.paid ? 'is-done' : ''}" type="submit">${r.paid ? '✔ Paid' : `Mark paid · $${money(a.cost)} due`}</button>
          </form>
          <form method="POST" action="/portal/meet/${esc(meet.id)}/checkin/toggle-checkin/${esc(r.id)}?returnTo=checkin" class="checkin-form">
            <button class="ci-btn ci-btn-in ${r.checkedIn ? 'is-done' : ''}" type="submit">${r.checkedIn ? '✔ Checked in' : 'Check in'}</button>
          </form>
        </div>
      </div>`;
  }).join('');

  const attentionItems = attentionList.map(a => {
    const helmetIssue = a.noHelmet || a.dupHelmet;
    return `
      <button type="button" class="ci-attn-item ${helmetIssue ? 'is-helmet' : 'is-payment'}" data-jump="${esc(a.reg.id)}">
        <div class="ci-attn-top">
          <span class="ci-attn-tag">${helmetIssue ? 'HELMET' : 'PAYMENT'}</span>
          <span class="ci-attn-name">${esc(a.reg.name)}</span>
          <span class="ci-attn-num">#${esc(a.reg.meetNumber || '—')}</span>
        </div>
        <div class="ci-attn-detail">${esc(a.issues.join(' · '))}</div>
        <div class="ci-attn-action">${a.noHelmet ? 'Assign helmet #' : a.dupHelmet ? 'Resolve duplicate' : 'Take payment'} →</div>
      </button>`;
  }).join('') || '<div class="ci-attn-empty">Everyone is ready to race.</div>';

  return `
    <div class="page-header"><h1>Check-In</h1><div class="sub">${esc(meet.meetName)} • race-day front desk</div></div>
    ${flash}
    <style>
      .ci-wrap{--ci-navy:#13213a;--ci-navy2:#1b2c4a;--ci-orange:#F97316;--ci-orange-d:#c2410c;
        --ci-sky:#38BDF8;--ci-sky-d:#0ea5e9;--ci-green:#10b981;--ci-green-d:#047857;
        --ci-slate:#667085;--ci-line:rgba(19,33,58,.10);--ci-line2:rgba(19,33,58,.16);}

      .ci-flash{background:#ecfdf5;border:1px solid #6ee7b7;color:#047857;border-radius:14px;
        padding:12px 16px;margin-bottom:12px;font-weight:800;font-size:14px;}

      /* ── command band ── */
      .ci-band{display:grid;grid-template-columns:1.1fr 1.4fr 1.1fr 1.15fr;gap:18px;padding:18px 22px;
        background:linear-gradient(135deg,#13213a 0%,#1b2c4a 58%,#13213a 100%);
        border-radius:20px;box-shadow:0 10px 30px rgba(19,33,58,.12);margin-bottom:16px;}
      .ci-band-cell{display:flex;flex-direction:column;gap:8px;min-width:0;}
      .ci-band-cell + .ci-band-cell{padding-left:22px;border-left:1px solid rgba(255,255,255,.14);}
      .ci-band-label{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;}
      .ci-band-label.sky{color:var(--ci-sky);}
      .ci-band-label.orange{color:var(--ci-orange);}
      .ci-band-label.amber{color:#FDBA74;}
      .ci-band-value{font-size:40px;font-weight:800;line-height:1;letter-spacing:-.03em;color:#fff;}
      .ci-band-sub{font-size:12.5px;font-weight:650;color:rgba(255,255,255,.62);}
      .ci-band-of{font-size:14px;font-weight:600;color:rgba(255,255,255,.62);}
      .ci-bar{height:8px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden;}
      .ci-bar > i{display:block;height:100%;background:var(--ci-sky);}
      .ci-band-actions{display:flex;flex-direction:column;justify-content:center;gap:9px;}
      .ci-walkup{display:inline-flex;align-items:center;justify-content:center;min-height:44px;
        border-radius:12px;background:var(--ci-orange);color:#fff;font-weight:800;font-size:14px;
        text-decoration:none;box-shadow:0 4px 14px rgba(249,115,22,.4);}
      .ci-secondary{display:inline-flex;align-items:center;justify-content:center;min-height:40px;
        border-radius:12px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);
        color:#fff;font-weight:700;font-size:13px;text-decoration:none;}

      /* ── search ── */
      .ci-searchrow{display:flex;gap:14px;align-items:center;margin-bottom:13px;}
      .ci-searchbox{flex:1;position:relative;display:flex;align-items:center;}
      .ci-searchbox::before{content:"⌕";position:absolute;left:20px;font-size:22px;color:#94a3b8;}
      #ciSearch{width:100%;box-sizing:border-box;min-height:64px;padding:0 20px 0 52px;border-radius:18px;
        border:2px solid var(--ci-sky);background:#fff;font-size:20px;font-weight:700;color:var(--ci-navy);
        box-shadow:0 6px 20px rgba(56,189,248,.16);}
      #ciTeam,#ciStatus{width:190px;box-sizing:border-box;min-height:64px;padding:0 16px;border-radius:18px;
        border:1.5px solid var(--ci-line2);background:#fff;font-size:15px;font-weight:600;color:var(--ci-navy);}
      .ci-quick{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:16px;}
      .ci-quick button{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:999px;
        font-size:13.5px;font-weight:800;cursor:pointer;background:#fff;color:var(--ci-slate);
        border:1.5px solid var(--ci-line2);}
      .ci-quick button.warn{background:#fff7ed;color:var(--ci-orange-d);border-color:#fed7aa;}
      .ci-quick button.is-on{background:var(--ci-navy);color:#fff;border-color:var(--ci-navy);}

      /* ── layout ── */
      .ci-layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:18px;align-items:start;}
      .ci-queue-head{display:flex;align-items:center;gap:10px;margin:4px 3px 10px;}
      .ci-queue-title{font-size:12.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--ci-slate);}
      .ci-queue-hint{font-size:13px;font-weight:600;color:#94a3b8;}
      #ciCards{display:flex;flex-direction:column;gap:9px;}

      /* ── skater card: compact by default ── */
      .checkin-card{background:#fff;border:1px solid var(--ci-line);border-left:4px solid transparent;
        border-radius:16px;padding:11px 16px;cursor:pointer;}
      .checkin-card.is-hidden{display:none;}
      .checkin-card[data-attention="attention"]{border-left-color:var(--ci-orange);}
      .checkin-card[data-checkin="checked"]{border-left-color:var(--ci-green);}

      .ci-identity{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:14px;align-items:center;}
      .ci-helmet{display:flex;align-items:center;justify-content:center;width:54px;height:54px;flex:none;
        border-radius:14px;background:var(--ci-navy);color:#fff;font-size:22px;font-weight:800;letter-spacing:-.03em;}
      .ci-helmet.is-missing{background:#fff7ed;border:2px dashed #fdba74;color:var(--ci-orange-d);}
      .ci-who{min-width:0;}
      .ci-nameline{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
      .ci-name{font-size:17px;font-weight:800;letter-spacing:-.02em;color:var(--ci-navy);}
      .ci-regnum{font-size:12.5px;font-weight:700;color:#94a3b8;}
      .ci-sponsor{font-size:13px;font-weight:600;color:var(--ci-sky-d);margin-top:4px;display:none;}
      .ci-meta{font-size:13px;font-weight:500;color:var(--ci-slate);margin-top:3px;}
      .ci-chips{display:none;flex-wrap:wrap;gap:8px;margin-top:13px;}
      .ci-chip{display:inline-flex;align-items:center;min-height:30px;padding:5px 11px;border-radius:999px;
        background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;font-size:12.5px;font-weight:750;}
      .ci-chip-team{background:#eff6ff;border-color:#bfdbfe;color:#1e40af;}
      .ci-chip-cost{background:#f8fafc;border-color:#e2e8f0;color:var(--ci-navy);}
      .ci-chip-warn{background:#fff7ed;border-color:#fed7aa;color:var(--ci-orange-d);}
      .ci-issues{font-size:13px;font-weight:700;color:var(--ci-orange-d);margin-top:8px;}

      .ci-status{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:800;}
      .ci-status-ready{background:#ecfdf5;border:1px solid #6ee7b7;color:var(--ci-green-d);}
      .ci-status-attn{background:#fff7ed;border:1px solid #fed7aa;color:var(--ci-orange-d);}

      .ci-helmet-edit{display:none;flex-direction:column;gap:6px;align-items:flex-end;flex:none;}
      .ci-helmet-form label{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
        color:var(--ci-slate);margin-bottom:4px;display:block;text-align:right;}
      .ci-helmet-row{display:flex;gap:7px;}
      .ci-helmet-row input{width:110px;box-sizing:border-box;min-height:52px;padding:0 14px;border-radius:12px;
        text-align:center;font-size:24px;font-weight:800;color:var(--ci-navy);background:#fff;border:1.5px solid var(--ci-line2);}
      .ci-save{display:inline-flex;align-items:center;padding:0 16px;border-radius:12px;background:var(--ci-navy);
        color:#fff;font-size:14px;font-weight:800;border:0;cursor:pointer;}
      .ci-edit-link{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 16px;
        border-radius:11px;background:#fff;border:1.5px solid var(--ci-line2);color:var(--ci-navy);
        font-size:13px;font-weight:700;text-decoration:none;}

      .ci-actions{display:grid;grid-template-columns:auto auto;gap:9px;justify-content:end;margin-top:0;}
      .ci-identity{grid-template-areas:none;}
      .checkin-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;}
      .checkin-card > .ci-identity{grid-column:1;}
      .checkin-card > .ci-actions{grid-column:2;}
      .checkin-card .checkin-form{margin:0;}
      .ci-btn{display:flex;align-items:center;justify-content:center;gap:5px;min-height:44px;padding:0 14px;
        border-radius:11px;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap;width:100%;}
      .ci-btn-paid{background:#fff7ed;color:var(--ci-orange-d);border:1.5px solid #fed7aa;}
      .ci-btn-in{background:var(--ci-navy);color:#fff;border:1.5px solid var(--ci-navy);}
      .ci-btn.is-done{background:#ecfdf5;color:var(--ci-green-d);border:1.5px solid #6ee7b7;}

      /* ── focused card: the person at the desk ── */
      .checkin-card.is-focus{grid-template-columns:minmax(0,1fr);padding:22px;border-radius:24px;
        border-left:6px solid var(--ci-sky);box-shadow:0 12px 34px rgba(15,31,61,.09);cursor:default;}
      .checkin-card.is-focus .ci-identity{grid-template-columns:96px minmax(0,1fr) auto;align-items:flex-start;gap:20px;}
      .checkin-card.is-focus .ci-helmet{width:96px;height:96px;border-radius:22px;font-size:44px;}
      .checkin-card.is-focus .ci-name{font-size:32px;line-height:1.1;}
      .checkin-card.is-focus .ci-regnum{display:inline-flex;align-items:center;justify-content:center;
        min-width:52px;height:28px;padding:0 10px;border-radius:999px;background:#eff6ff;border:1px solid #bfdbfe;
        color:#1d4ed8;font-size:14px;font-weight:800;}
      .checkin-card.is-focus .ci-sponsor{display:block;}
      .checkin-card.is-focus .ci-meta{display:none;}
      .checkin-card.is-focus .ci-chips{display:flex;}
      .checkin-card.is-focus .ci-helmet-edit{display:flex;}
      .checkin-card.is-focus .ci-actions{grid-column:1;grid-template-columns:1fr 1fr;justify-content:stretch;margin-top:20px;}
      .checkin-card.is-focus .ci-btn{min-height:60px;border-radius:14px;font-size:16px;}
      .checkin-card.is-focus .ci-btn-in{background:var(--ci-green);border-color:var(--ci-green);
        box-shadow:0 4px 14px rgba(16,185,129,.35);}
      .checkin-card.is-focus .ci-btn-in.is-done{background:#ecfdf5;color:var(--ci-green-d);
        border-color:#6ee7b7;box-shadow:none;}

      /* ── attention rail ── */
      .ci-rail{display:flex;flex-direction:column;gap:12px;padding:18px 16px;border-radius:22px;
        background:var(--ci-navy);box-shadow:0 10px 30px rgba(19,33,58,.14);position:sticky;top:12px;}
      .ci-rail-head{display:flex;align-items:center;gap:9px;}
      .ci-rail-dot{width:8px;height:8px;border-radius:50%;background:var(--ci-orange);}
      .ci-rail-title{font-size:12.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#fff;}
      .ci-rail-count{margin-left:auto;font-size:18px;font-weight:800;color:var(--ci-orange);}
      .ci-rail-sub{font-size:11.5px;font-weight:600;color:rgba(255,255,255,.45);margin-top:-4px;}
      .ci-attn-item{display:block;width:100%;text-align:left;padding:12px 13px;border-radius:12px;
        background:rgba(255,255,255,.05);border:0;border-left:3px solid var(--ci-sky);cursor:pointer;}
      .ci-attn-item.is-helmet{border-left-color:var(--ci-orange);}
      .ci-attn-top{display:flex;align-items:center;gap:8px;}
      .ci-attn-tag{display:inline-flex;padding:3px 7px;border-radius:5px;font-size:9.5px;font-weight:800;letter-spacing:.08em;
        background:rgba(56,189,248,.18);color:#7DD3FC;}
      .is-helmet .ci-attn-tag{background:rgba(249,115,22,.18);color:#FDBA74;}
      .ci-attn-name{font-size:13px;font-weight:750;color:#fff;}
      .ci-attn-num{margin-left:auto;font-size:11.5px;font-weight:600;color:rgba(255,255,255,.45);}
      .ci-attn-detail{font-size:12px;line-height:1.45;color:rgba(255,255,255,.66);margin-top:5px;}
      .ci-attn-action{font-size:12px;font-weight:800;color:var(--ci-sky);margin-top:7px;}
      .ci-attn-empty{font-size:13px;color:rgba(255,255,255,.6);padding:8px 2px;}
      .ci-rail-foot{margin-top:6px;padding-top:13px;border-top:1px solid rgba(255,255,255,.12);
        font-size:12px;line-height:1.5;color:rgba(255,255,255,.5);}
      .ci-attn-pill{display:none;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;
        background:#fff7ed;border:1px solid #fed7aa;font-size:12px;font-weight:800;color:var(--ci-orange-d);
        margin-left:auto;cursor:pointer;}

      .no-ci-results{display:none;padding:16px;color:var(--ci-slate);}

      /* ── door mode: tablet landscape ── */
      @media(max-width:1200px){
        .ci-layout{grid-template-columns:minmax(0,1fr);}
        .ci-rail{order:2;position:static;}
        .ci-attn-pill{display:inline-flex;}
        .ci-band{grid-template-columns:1fr 1fr;gap:14px;}
        .ci-band-cell:nth-child(3){padding-left:0;border-left:0;}
        #ciTeam{display:none;}
      }
      /* ── door mode: tablet portrait ── */
      @media(max-width:900px){
        .ci-band{grid-template-columns:1fr;}
        .ci-band-cell + .ci-band-cell{padding-left:0;border-left:0;padding-top:14px;
          border-top:1px solid rgba(255,255,255,.14);}
        .ci-searchrow{flex-wrap:wrap;}
        #ciStatus{width:100%;}
        .checkin-card{grid-template-columns:minmax(0,1fr);}
        .checkin-card > .ci-actions{grid-column:1;grid-template-columns:1fr 1fr;justify-content:stretch;
          padding-top:10px;border-top:1px solid var(--ci-line);}
        .ci-btn{min-height:52px;font-size:14px;}
        .checkin-card.is-focus .ci-identity{grid-template-columns:76px minmax(0,1fr);}
        .checkin-card.is-focus .ci-helmet{width:76px;height:76px;border-radius:18px;font-size:34px;}
        .checkin-card.is-focus .ci-name{font-size:25px;}
        .checkin-card.is-focus .ci-helmet-edit{grid-column:1 / -1;flex-direction:row;align-items:center;
          justify-content:flex-start;flex-wrap:wrap;margin-top:14px;padding-top:14px;
          border-top:1px solid var(--ci-line);}
        .ci-helmet-form label{text-align:left;}
        .ci-edit-link{margin-left:auto;min-height:52px;}
      }
      @media(max-width:560px){
        .checkin-card{padding:14px;}
        .checkin-card.is-focus{padding:16px;}
        .checkin-card > .ci-actions,
        .checkin-card.is-focus .ci-actions{grid-template-columns:1fr;}
        .ci-helmet-row input{flex:1;width:auto;}
      }
    </style>

    <div class="ci-wrap">
      <div class="ci-band">
        <div class="ci-band-cell">
          <div class="ci-band-label sky">Checked in</div>
          <div><span class="ci-band-value">${checkedInCount}</span> <span class="ci-band-of">of ${total}</span></div>
          <div class="ci-bar"><i style="width:${pct}%"></i></div>
          <div class="ci-band-sub">${remaining} still to arrive</div>
        </div>
        <div class="ci-band-cell">
          <div class="ci-band-label orange">Collected</div>
          <div><span class="ci-band-value">$${money(totalPaid)}</span> <span class="ci-band-of">of $${money(totalOwed)}</span></div>
          <div class="ci-band-sub">Cash and card taken at the door</div>
        </div>
        <div class="ci-band-cell">
          <div class="ci-band-label amber">Needs attention</div>
          <div class="ci-band-value">${attentionList.length}</div>
          <div class="ci-band-sub">Helmet or payment before they skate</div>
        </div>
        <div class="ci-band-cell ci-band-actions">
          <a class="ci-walkup" href="/meet/${esc(meet.id)}/register">+ Walk-up registration</a>
          <a class="ci-secondary" href="/portal/meet/${esc(meet.id)}/registered">Full roster</a>
        </div>
      </div>

      <div class="ci-searchrow">
        <div class="ci-searchbox">
          <input id="ciSearch" placeholder="Name, reg #, or helmet #" autocomplete="off" autofocus />
        </div>
        <input id="ciTeam" placeholder="Team" autocomplete="off" />
        <select id="ciStatus">
          <option value="all">All</option>
          <option value="not_in">Not Checked In</option>
          <option value="not_paid">Not Paid</option>
          <option value="no_helmet">Missing Helmet</option>
          <option value="attention">Needs Attention</option>
          <option value="in">Checked In</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      <div class="ci-quick">
        <button type="button" data-filter="all">All · ${total}</button>
        <button type="button" data-filter="not_in">Not checked in · ${remaining}</button>
        <button type="button" class="warn" data-filter="not_paid">Unpaid · ${unpaidCount}</button>
        <button type="button" class="warn" data-filter="no_helmet">Missing helmet · ${noHelmetCount}</button>
        <button type="button" data-filter="in">Checked in · ${checkedInCount}</button>
      </div>

      <div class="ci-layout">
        <div>
          <div class="ci-queue-head">
            <span class="ci-queue-title">Queue</span>
            <span class="ci-queue-hint">Tap a row to pull it into focus</span>
            <span class="ci-attn-pill" data-scroll-rail="1">⚠ ${attentionList.length} need attention</span>
          </div>
          <div id="ciCards">${cards || '<div class="card"><div class="muted">No registrations yet.</div></div>'}</div>
          <div id="ciNoResults" class="card no-ci-results">No registrations match those filters.</div>
        </div>

        <div class="ci-rail">
          <div class="ci-rail-head">
            <span class="ci-rail-dot"></span>
            <span class="ci-rail-title">Needs attention</span>
            <span class="ci-rail-count">${attentionList.length}</span>
          </div>
          <div class="ci-rail-sub">Sorted to the top of the queue</div>
          ${attentionItems}
          <div class="ci-rail-foot">Anyone listed here can still be checked in — the flag follows them to the start line.</div>
        </div>
      </div>
    </div>

    <script>
      (function(){
        var savedY = sessionStorage.getItem('ciY');
        if(savedY){ window.scrollTo(0, parseInt(savedY, 10)); sessionStorage.removeItem('ciY'); }
        document.querySelectorAll('.checkin-form').forEach(function(form){
          form.addEventListener('submit', function(){ sessionStorage.setItem('ciY', String(window.scrollY)); });
        });

        var q = document.getElementById('ciSearch');
        var team = document.getElementById('ciTeam');
        var status = document.getElementById('ciStatus');
        var noResults = document.getElementById('ciNoResults');
        var quick = document.querySelectorAll('.ci-quick button');
        var pinned = null;

        function v(el){ return String((el && el.value) || '').trim().toLowerCase(); }

        function syncQuick(){
          var s = v(status) || 'all';
          quick.forEach(function(b){ b.classList.toggle('is-on', b.dataset.filter === s); });
        }

        function applyCI(){
          var search = v(q);
          var teamQ = v(team);
          var statusQ = v(status);
          var visible = 0;
          var firstVisible = null;

          document.querySelectorAll('.checkin-card').forEach(function(card){
            var hay = [card.dataset.name, card.dataset.meetNumber, card.dataset.helmet].join(' ');
            var ok = true;
            if(search && hay.indexOf(search) === -1) ok = false;
            if(teamQ && String(card.dataset.team || '').indexOf(teamQ) === -1) ok = false;
            if(statusQ === 'not_paid' && card.dataset.paid !== 'unpaid') ok = false;
            if(statusQ === 'paid' && card.dataset.paid !== 'paid') ok = false;
            if(statusQ === 'not_in' && card.dataset.checkin !== 'not-checked') ok = false;
            if(statusQ === 'in' && card.dataset.checkin !== 'checked') ok = false;
            if(statusQ === 'no_helmet' && card.dataset.nohelmet !== 'yes') ok = false;
            if(statusQ === 'attention' && card.dataset.attention !== 'attention') ok = false;
            card.classList.toggle('is-hidden', !ok);
            card.classList.remove('is-focus');
            if(ok){
              visible += 1;
              if(!firstVisible) firstVisible = card;
              if(pinned && card.dataset.regId === pinned) firstVisible = card;
            }
          });

          if(firstVisible) firstVisible.classList.add('is-focus');
          if(noResults) noResults.style.display = visible ? 'none' : 'block';
          syncQuick();
        }

        [q, team, status].forEach(function(el){
          if(!el) return;
          el.addEventListener('input', applyCI);
          el.addEventListener('change', applyCI);
        });

        quick.forEach(function(b){
          b.addEventListener('click', function(){
            if(status){ status.value = b.dataset.filter; }
            pinned = null;
            applyCI();
          });
        });

        // Tap a queue row to pull that skater into focus.
        document.getElementById('ciCards').addEventListener('click', function(e){
          if(e.target.closest('form') || e.target.closest('a')) return;
          var card = e.target.closest('.checkin-card');
          if(!card || card.classList.contains('is-focus')) return;
          pinned = card.dataset.regId;
          applyCI();
        });

        // Attention rail jumps to a skater.
        document.querySelectorAll('.ci-attn-item').forEach(function(btn){
          btn.addEventListener('click', function(){
            var id = btn.dataset.jump;
            if(q) q.value = '';
            if(team) team.value = '';
            if(status) status.value = 'all';
            pinned = id;
            applyCI();
            var target = document.querySelector('.checkin-card[data-reg-id="' + id + '"]');
            if(target){ window.scrollTo(0, Math.max(0, target.getBoundingClientRect().top + window.scrollY - 90)); }
          });
        });

        var railPill = document.querySelector('[data-scroll-rail]');
        if(railPill){
          railPill.addEventListener('click', function(){
            var rail = document.querySelector('.ci-rail');
            if(rail){ window.scrollTo(0, Math.max(0, rail.getBoundingClientRect().top + window.scrollY - 20)); }
          });
        }

        applyCI();
      })();
    </script>`;
}

module.exports = {
  renderCheckinView,
};
