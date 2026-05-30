const { esc } = require('../utils/html');

function renderPendingMeetsView({ pending = [], approved = [], rejected = [] }) {
  const pendingRows = pending.map(p => `
    <div class="card" style="margin-bottom:14px;border-left:4px solid var(--orange)">
      <div class="row between" style="margin-bottom:8px">
        <div>
          <h2 style="margin:0">${esc(p.meetName)}</h2>
          <div class="note">${esc(p.city)}, ${esc(p.state)} • ${esc(p.date)}</div>
        </div>
        <span class="chip chip-orange">Pending Review</span>
      </div>
      <div class="grid-2" style="margin-bottom:12px">
        <div>
          <div class="note"><strong>Contact:</strong> ${esc(p.contactName)}</div>
          <div class="note">${esc(p.contactEmail)}${p.contactPhone ? ' • ' + esc(p.contactPhone) : ''}</div>
        </div>
        <div>
          ${p.registrationUrl ? `<div class="note"><strong>Reg URL:</strong> <a href="${esc(p.registrationUrl)}" target="_blank" style="color:var(--orange)">View →</a></div>` : ''}
        </div>
      </div>
      ${p.description ? `<div class="note" style="margin-bottom:12px">${esc(p.description)}</div>` : ''}
      <div class="action-row">
        <form method="POST" action="/portal/pending-meets/approve" style="display:inline">
          <input type="hidden" name="id" value="${esc(p.id)}" />
          <button class="btn-orange" type="submit">✅ Approve</button>
        </form>
        <form method="POST" action="/portal/pending-meets/reject" style="display:inline">
          <input type="hidden" name="id" value="${esc(p.id)}" />
          <input name="reason" placeholder="Reason (optional, emailed to submitter)" style="width:260px" />
          <button class="btn-danger" type="submit">❌ Reject</button>
        </form>
      </div>
    </div>`).join('');

  return `
    <div class="page-header"><h1>Pending Meets</h1><div class="sub">Review and approve meet submissions.</div></div>
    <div class="action-row" style="margin-bottom:20px">
      <a class="btn2" href="/portal">← Portal</a>
    </div>
    ${pending.length ? `<h2 style="margin-bottom:12px">⏳ Awaiting Review (${pending.length})</h2>${pendingRows}` : `<div class="card"><div class="muted">No pending submissions. 🎉</div></div>`}
    ${approved.length ? `<div class="spacer"></div><h2 style="margin-bottom:12px;color:var(--green)">✅ Recently Approved</h2>
      ${approved.map(p => `<div class="card" style="margin-bottom:8px;opacity:.7"><div class="row between"><div><strong>${esc(p.meetName)}</strong> — ${esc(p.city)}, ${esc(p.state)} • ${esc(p.date)}</div><span class="chip chip-green">Approved</span></div></div>`).join('')}` : ''}
    ${rejected.length ? `<div class="spacer"></div><h2 style="margin-bottom:12px;color:var(--muted)">❌ Recently Rejected</h2>
      ${rejected.map(p => `<div class="card" style="margin-bottom:8px;opacity:.7"><div class="row between"><div><strong>${esc(p.meetName)}</strong> — ${esc(p.city)}, ${esc(p.state)} • ${esc(p.date)}</div><span class="chip">Rejected</span></div></div>`).join('')}` : ''}
  `;
}

module.exports = {
  renderPendingMeetsView,
};
