const { esc } = require('../utils/html');

function renderPendingRinksView({ pending = [], approved = [] }) {
  const pendingRows = pending.map(p => `
    <div class="card" style="margin-bottom:14px;border-left:4px solid var(--orange)">
      <div class="row between" style="margin-bottom:8px">
        <div>
          <h2 style="margin:0">${esc(p.name)}</h2>
          <div class="note">${esc(p.address)} • ${esc(p.city)}, ${esc(p.state)} ${esc(p.zip || '')}</div>
        </div>
        <span class="chip chip-orange">Pending Review</span>
      </div>
      <div class="grid-2" style="margin-bottom:12px">
        <div>
          ${p.phone ? `<div class="note"><strong>Phone:</strong> ${esc(p.phone)}</div>` : ''}
          ${p.website ? `<div class="note"><strong>Website:</strong> ${esc(p.website)}</div>` : ''}
          ${p.trackLength ? `<div class="note"><strong>Track:</strong> ${esc(p.trackLength)}</div>` : ''}
        </div>
        <div>
          <div class="note"><strong>Contact:</strong> ${esc(p.contactName)}</div>
          <div class="note">${esc(p.contactEmail)}</div>
        </div>
      </div>
      ${p.notes ? `<div class="note" style="margin-bottom:12px">${esc(p.notes)}</div>` : ''}
      <div class="action-row">
        <form method="POST" action="/portal/pending-rinks/approve" style="display:inline">
          <input type="hidden" name="id" value="${esc(p.id)}" />
          <button class="btn-orange" type="submit">✅ Approve & Add</button>
        </form>
        <form method="POST" action="/portal/pending-rinks/reject" style="display:inline">
          <input type="hidden" name="id" value="${esc(p.id)}" />
          <input name="reason" placeholder="Reason (optional)" style="width:220px" />
          <button class="btn-danger" type="submit">❌ Reject</button>
        </form>
      </div>
    </div>`).join('');

  return `
    <div class="page-header"><h1>Pending Rinks</h1><div class="sub">Review and approve rink submissions.</div></div>
    <div class="action-row" style="margin-bottom:20px"><a class="btn2" href="/portal">← Portal</a></div>
    ${pending.length ? `<h2 style="margin-bottom:12px">⏳ Awaiting Review (${pending.length})</h2>${pendingRows}` : `<div class="card"><div class="muted">No pending rink submissions. 🎉</div></div>`}
    ${approved.length ? `<div class="spacer"></div><h2 style="margin-bottom:12px;color:var(--green)">✅ Recently Approved</h2>
      ${approved.map(p => `<div class="card" style="margin-bottom:8px;opacity:.7"><div class="row between"><div><strong>${esc(p.name)}</strong> — ${esc(p.city)}, ${esc(p.state)}</div><span class="chip chip-green">Approved</span></div></div>`).join('')}` : ''}
  `;
}

module.exports = {
  renderPendingRinksView,
};