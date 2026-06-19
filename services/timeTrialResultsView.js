const { esc } = require('../utils/html');
const { skaterAvatarHtml } = require('./avatarDisplay');
const { timeTrialEventTitle, timeTrialResults } = require('./timeTrialEvents');

function resultRowsHtml(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => `
    <tr>
      <td><strong>${esc(row.rank)}</strong></td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          ${skaterAvatarHtml(row, {}, 'small')}
          <div>
            <strong>${esc(row.skater || '')}</strong>
            <div class="muted" style="font-size:12px">${esc(row.team || '')}</div>
          </div>
        </div>
      </td>
      <td>${esc(row.gender || '')}</td>
      <td><strong>${esc(row.time || '')}</strong></td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted">No times yet.</td></tr>';
}

function timeTrialResultCard(title, rows) {
  return `
    <div class="card" style="border-left:4px solid var(--sky2)">
      <h2 style="margin-top:0">${esc(title)}</h2>
      <table class="table">
        <thead><tr><th>Place</th><th>Skater</th><th>Gender</th><th>Time</th></tr></thead>
        <tbody>${resultRowsHtml(rows)}</tbody>
      </table>
    </div>`;
}

function renderTimeTrialFinalResultsHtml(events = []) {
  const sections = (Array.isArray(events) ? events : []).map(event => {
    const results = timeTrialResults(event);
    if (!results.overall.length) return '';
    return `
      <div class="spacer"></div>
      <h2 style="color:var(--sky2)">⏱ ${esc(timeTrialEventTitle(event))}</h2>
      <div class="note" style="margin-bottom:12px">Distance: ${esc(event.distance || '100m')}</div>
      <div class="grid-3">
        ${timeTrialResultCard('Overall Results', results.overall)}
        ${timeTrialResultCard('Male Results', results.male)}
        ${timeTrialResultCard('Female Results', results.female)}
      </div>`;
  }).filter(Boolean);
  return sections.join('');
}

function renderTimeTrialFinalResultsPrintHtml(events = []) {
  return (Array.isArray(events) ? events : []).map(event => {
    const results = timeTrialResults(event);
    if (!results.overall.length) return '';
    const section = (title, rows) => `
      <div class="section">
        <h2>${esc(timeTrialEventTitle(event))} — ${esc(title)}</h2>
        <div class="meta">Distance: ${esc(event.distance || '100m')}</div>
        <table>
          <thead><tr><th>Place</th><th>Skater</th><th>Team</th><th>Gender</th><th>Time</th></tr></thead>
          <tbody>${(rows || []).map(row => `<tr><td>${esc(row.rank)}</td><td>${esc(row.skater || '')}</td><td>${esc(row.team || '')}</td><td>${esc(row.gender || '')}</td><td>${esc(row.time || '')}</td></tr>`).join('') || '<tr><td colspan="5">No times.</td></tr>'}</tbody>
        </table>
      </div>`;
    return [
      section('Overall Results', results.overall),
      section('Male Results', results.male),
      section('Female Results', results.female),
    ].join('');
  }).filter(Boolean).join('');
}

module.exports = {
  renderTimeTrialFinalResultsHtml,
  renderTimeTrialFinalResultsPrintHtml,
};
