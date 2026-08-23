const { esc } = require('../utils/html');

// Interstitial shown when a regenerating action (Rebuild Assignments, division
// scheme switch) is requested AFTER racing has started. It never proceeds on its
// own — the director must click "Regenerate anyway", which re-submits the same
// action with confirmRegen=1. A desktop backup is written before the regen runs,
// so this is recoverable, but the warning stops a silent wipe of entered results.
function renderRegenConfirm({ meet, actionUrl, actionLabel, cancelUrl, summary = {}, hiddenInputs = [] }) {
  const closed = Number(summary.closed || 0);
  const scored = Number(summary.scored || 0);
  const bits = [];
  if (closed) bits.push(`${closed} race${closed === 1 ? '' : 's'} closed`);
  if (scored) bits.push(`${scored} race${scored === 1 ? '' : 's'} with results entered`);
  const detail = bits.length ? bits.join(' · ') : 'results have been entered';
  const hidden = (hiddenInputs || [])
    .map(({ name, value }) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`)
    .join('');
  return `
    <div class="page-header"><h1>Racing Has Started</h1><div class="sub">${esc(meet.meetName || '')}</div></div>
    <div class="card" style="max-width:640px;border-left:5px solid #b91c1c">
      <h2 style="margin-top:0;color:#b91c1c">⚠ This will erase entered results</h2>
      <p style="line-height:1.5">
        This meet already has racing underway (<strong>${esc(detail)}</strong>).
        ${esc(actionLabel)} rebuilds the race set, which <strong>replaces the current
        heats, lane assignments, places, and times</strong>. A backup is saved first,
        but entered results will be gone from the live meet.
      </p>
      <div class="action-row" style="margin-top:18px;display:flex;gap:12px;flex-wrap:wrap">
        <form method="post" action="${esc(actionUrl)}" style="margin:0">
          ${hidden}
          <input type="hidden" name="confirmRegen" value="1">
          <button type="submit" class="btn-orange" style="background:#b91c1c;border-color:#b91c1c">Regenerate anyway (erase results)</button>
        </form>
        <a class="btn2" href="${esc(cancelUrl)}">Cancel — keep results</a>
      </div>
    </div>`;
}

module.exports = { renderRegenConfirm };
