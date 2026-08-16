const { esc } = require('../utils/html');

// ── Officials Disqualification Report ────────────────────────────────────────
// Print document for /portal/meet/:meetId/results/dq-report (meet_director, judge).
//
// Same data as before — statusRowsForMeet(meet, { onlyDisqualifications: true }) —
// rebuilt as a document that holds up in a dispute rather than a wide table:
// one block per DQ, numbered and grouped by race, notes in a readable box, a
// protest/resolution line on every entry, a blank entry for a DQ ruled after
// printing, and a certification block.
//
// Type is 12px body / 10px labels. The version this replaces set body at 11px
// with 9px headers, which is below the readable floor for a document an official
// reads under pressure and writes on by hand. Write-on rules are 30px, signature
// rules 36px — an adult cannot write on the 15px lines the screen design first had.
function renderDqReportView({ meet, rows = [], dateLine = '', location = '', generatedAt = '' }) {
  const categories = [...new Set(rows.map(r => r.dqCategoryLabel || r.statusLabel).filter(Boolean))];
  const raceCount = new Set(rows.map(r => r.raceId)).size;

  const blocks = rows.map((row, i) => `
    <section class="dq-block">
      <div class="dq-block-bar">
        <span class="dq-n">${i + 1}</span>
        <span class="dq-race">${esc(row.raceLabel || '')}</span>
      </div>

      <div class="dq-split">
        <div class="dq-cell">
          <div class="dq-label">Skater</div>
          <div class="dq-value-lg">${esc(row.skaterName || '')}</div>
          <div class="dq-value-sm">${row.helmetNumber ? 'Helmet #' + esc(row.helmetNumber) + ' · ' : ''}${esc(row.team || '')}</div>
        </div>
        <div class="dq-cell">
          <div class="dq-label">Ruling</div>
          <div class="dq-value-lg">${esc(row.statusLabel || '')}</div>
          <div class="dq-value-sm">Rule reference: ${esc(row.dqRuleReference || '—')}</div>
        </div>
      </div>

      <div class="dq-notes-wrap">
        <div class="dq-label">Official's notes</div>
        <div class="dq-notes">${esc(row.dqOfficialNotes || '')}</div>
      </div>

      <div class="dq-foot">
        <div class="dq-cell">
          <div class="dq-label">Recorded by</div>
          <div class="dq-value-sm dq-strong">${esc(row.dqRecordedBy || '—')}</div>
        </div>
        <div class="dq-cell">
          <div class="dq-label">Timestamp</div>
          <div class="dq-value-sm dq-strong">${esc(row.dqTimestamp ? new Date(row.dqTimestamp).toLocaleString() : '—')}</div>
        </div>
        <div class="dq-cell">
          <div class="dq-label">Protest / resolution</div>
          <div class="dq-rule"></div>
        </div>
      </div>
    </section>`).join('');

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Officials DQ Report — ${esc(meet.meetName)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45}
  .page{padding:26px 30px 30px;max-width:1000px;margin:0 auto}

  .controls{display:flex;gap:8px;margin-bottom:16px;padding:10px 14px;background:#f8fafc;border:1px solid #ddd}
  .controls button,.controls a{
    border:1px solid #bbb;background:#fff;color:#111;border-radius:4px;
    padding:6px 10px;font-size:12px;text-decoration:none;cursor:pointer;font-family:inherit}
  .controls .hint{margin-left:auto;align-self:center;font-size:11px;color:#666}

  header.doc{border-bottom:2px solid #111;padding-bottom:9px;margin-bottom:6px;
    display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
  h1{margin:0 0 3px;font-size:21px}
  .doc-sub{font-size:14px;font-weight:700;letter-spacing:.02em}
  .doc-meta{font-size:11.5px;color:#444;margin-top:4px}
  .doc-right{text-align:right;flex:none;font-size:11.5px;color:#444}
  .doc-conf{font-weight:700;color:#111}

  .summary{display:flex;gap:22px;flex-wrap:wrap;padding:8px 0 14px;
    border-bottom:1px solid #ddd;margin-bottom:14px;font-size:12px;color:#333}
  .summary strong{color:#111}
  .summary .gen{margin-left:auto}

  .dq-block{border:1px solid #999;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid}
  .dq-block-bar{display:flex;align-items:center;gap:10px;padding:6px 9px;
    background:#f1f5f9;border-bottom:1px solid #999}
  .dq-n{display:flex;align-items:center;justify-content:center;width:22px;height:22px;
    flex:none;border:1px solid #111;font-size:12px;font-weight:700}
  .dq-race{font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}

  .dq-split{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #ddd}
  .dq-split .dq-cell + .dq-cell{border-left:1px solid #ddd}
  .dq-cell{padding:8px 9px}
  .dq-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666}
  .dq-value-lg{font-size:13px;font-weight:700;margin-top:2px}
  .dq-value-sm{font-size:12px;color:#444;margin-top:2px}
  .dq-strong{color:#111}

  .dq-notes-wrap{padding:8px 9px;border-bottom:1px solid #ddd}
  .dq-notes{border:1px solid #ccc;padding:8px 10px;min-height:46px;
    white-space:pre-wrap;font-size:12px;line-height:1.5;color:#111;margin-top:4px}

  .dq-foot{display:grid;grid-template-columns:1.2fr 1fr 1.1fr}
  .dq-foot .dq-cell + .dq-cell{border-left:1px solid #ddd}
  .dq-rule{border-bottom:1px solid #999;height:30px;margin-top:6px}

  .blank-entry{border:1px dashed #999;padding:9px;margin-bottom:16px;font-size:12px;color:#555}
  .blank-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:12px}
  .blank-grid .rule{border-bottom:1px solid #999;height:30px}
  .blank-grid .cap{font-size:10px;color:#666;margin-top:3px}

  .cert{border-top:2px solid #111;padding-top:12px}
  .cert-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666;margin-bottom:12px}
  .cert-row{display:grid;grid-template-columns:1.4fr 1fr;gap:24px;margin-bottom:18px}
  .cert-rule{border-bottom:1px solid #111;height:36px}
  .cert-cap{font-size:11.5px;color:#444;margin-top:4px}
  .cert-note{font-size:11px;line-height:1.55;color:#666;margin-top:16px}

  .empty{border:1px solid #ddd;padding:10px;color:#555}

  @media print{
    @page{margin:.4in}
    .controls{display:none}
    .page{padding:0;max-width:none}
    .dq-block{border-color:#666}
  }
</style></head><body><main class="page">

  <div class="controls">
    <button type="button" onclick="window.print()">Print</button>
    <a href="/portal/meet/${esc(meet.id)}/results">Back To Results</a>
    <span class="hint">Screen controls — hidden when printed</span>
  </div>

  <header class="doc">
    <div>
      <h1>${esc(meet.meetName)}</h1>
      <div class="doc-sub">Officials Disqualification Report</div>
      <div class="doc-meta">${esc(dateLine || '')}${location ? ' · ' + esc(location) : ''}</div>
    </div>
    <div class="doc-right">
      <div class="doc-conf">CONFIDENTIAL — OFFICIALS ONLY</div>
      <div>Not for public distribution</div>
    </div>
  </header>

  <div class="summary">
    <span><strong>${rows.length}</strong> disqualification${rows.length === 1 ? '' : 's'}</span>
    <span><strong>${raceCount}</strong> race${raceCount === 1 ? '' : 's'} affected</span>
    ${categories.length ? `<span>Categories: ${esc(categories.join(', '))}</span>` : ''}
    <span class="gen">Generated ${esc(generatedAt || new Date().toLocaleString())}</span>
  </div>

  ${blocks || '<div class="empty">No disqualifications recorded.</div>'}

  <div class="blank-entry">
    Blank entry — for a disqualification ruled after this report was printed.
    <div class="blank-grid">
      <div><div class="rule"></div><div class="cap">Race</div></div>
      <div><div class="rule"></div><div class="cap">Skater / helmet #</div></div>
      <div><div class="rule"></div><div class="cap">Category / rule</div></div>
    </div>
  </div>

  <div class="cert">
    <div class="cert-title">Certification</div>
    <div class="cert-row">
      <div><div class="cert-rule"></div><div class="cert-cap">Chief Referee — signature</div></div>
      <div><div class="cert-rule"></div><div class="cert-cap">Date</div></div>
    </div>
    <div class="cert-row">
      <div><div class="cert-rule"></div><div class="cert-cap">Meet Director — signature</div></div>
      <div><div class="cert-rule"></div><div class="cert-cap">Date</div></div>
    </div>
    <div class="cert-note">
      Per USARS SR600.1, all disqualifications must be turned in to the chief placement judge
      before the next race or the disqualification is nullified. This report records rulings as
      entered on race day; notes and rule references are internal and are not published with results.
    </div>
  </div>

</main></body></html>`;
}

module.exports = {
  renderDqReportView,
};
