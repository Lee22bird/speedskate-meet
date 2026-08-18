// ── Results page theme ───────────────────────────────────────────────────────
// Dark restyle of /portal/meet/:id/results. CSS only.
//
// Why a theme and not a view rewrite: the standings markup comes from
// resultsSectionHtml() / quadResultsSectionHtml() in services/meetHelpers.js,
// which are SHARED with the print route (/results/print). Rewriting them would
// change print too. Everything below re-skins the markup those functions
// already emit — no HTML generation moves, no scoring logic is touched.
//
// Structures being styled (all already present):
//   .rb-results-toolbar / .rb-champ-grid / .rb-champ   champions board
//   details.result-section.audit-card                  collapsible division
//   .audit-summary-title / .chip-orange                section header + leader
//   .podium-grid / .podium-card                        top 3
//   .audit-race / .audit-race-title / .audit-heat      per-race breakdown
//   .table                                             standings + audit tables
//   .tb-badge / .tb-runoff / .runoff-row               tiebreaker + run-off
//   #resultsFilter                                     division filter
//
// Usage in routes/raceDayRoutes.js, results route only:
//   const { resultsThemeCss } = require('../views/resultsTheme');
//   ...
//   bodyHtml: `<style>${resultsThemeCss()}</style><div class="ssm-results-dark">
//       ...existing body...
//     </div>`
//
// The wrapper class is the only markup change required.

function resultsThemeCss() {
  return `
  /* Page surface — scoped to the results route because this <style> block
     is only emitted there. */
  body:has(.ssm-results-dark){ background:#0d1830; }

  .ssm-results-dark{ color:#fff; }
  .ssm-results-dark .page-header h1{ color:#fff; }
  .ssm-results-dark .page-header .sub{ color:rgba(255,255,255,.68); }
  .ssm-results-dark h1,
  .ssm-results-dark h2,
  .ssm-results-dark h3{ color:#fff; }
  .ssm-results-dark .note,
  .ssm-results-dark .muted{ color:rgba(255,255,255,.68); }
  .ssm-results-dark a{ color:#7DD3FC; }
  .ssm-results-dark a:hover{ color:#F97316; }

  /* Cards */
  .ssm-results-dark .card{
    background:rgba(255,255,255,.04);
    border:1px solid rgba(255,255,255,.10);
    box-shadow:none;
  }

  /* Buttons in the action row */
  .ssm-results-dark .btn2{
    background:rgba(255,255,255,.07);
    border:1.5px solid rgba(255,255,255,.20);
    color:#fff;
  }
  .ssm-results-dark .btn2:hover{
    background:rgba(255,255,255,.12);
    color:#fff;
  }

  /* Meet status chip row */
  .ssm-results-dark .chip{
    background:rgba(255,255,255,.07);
    border-color:rgba(255,255,255,.16);
    color:rgba(255,255,255,.85);
    box-shadow:none;
  }
  .ssm-results-dark .chip-orange{
    background:rgba(249,115,22,.16);
    border-color:rgba(249,115,22,.45);
    color:#FDBA74;
  }
  .ssm-results-dark .chip-green{
    background:rgba(16,185,129,.16);
    border-color:rgba(16,185,129,.45);
    color:#6EE7B7;
  }
  .ssm-results-dark .chip-sky{
    background:rgba(56,189,248,.14);
    border-color:rgba(56,189,248,.45);
    color:#7DD3FC;
  }
  .ssm-results-dark .chip-purple{
    background:rgba(124,58,237,.18);
    border-color:rgba(124,58,237,.5);
    color:#C4B5FD;
  }

  /* Champions board */
  .ssm-results-dark .rb-champ{
    background:rgba(255,255,255,.05);
    border-color:rgba(255,255,255,.12);
    color:#fff;
  }
  .ssm-results-dark .rb-champ:hover{ border-color:#F97316; }
  .ssm-results-dark .rb-champ-div{ color:#7DD3FC; }
  .ssm-results-dark .rb-champ-name{ color:#fff; }
  .ssm-results-dark .rb-champ-meta{ color:rgba(255,255,255,.68); }
  .ssm-results-dark #resultsFilter{
    background:rgba(255,255,255,.05);
    border:1.5px solid rgba(255,255,255,.16);
    color:#fff;
  }
  .ssm-results-dark #resultsFilter::placeholder{ color:rgba(255,255,255,.5); }

  /* Collapsible division sections */
  .ssm-results-dark details.result-section{
    background:rgba(255,255,255,.04);
    border:1px solid rgba(255,255,255,.10);
  }
  .ssm-results-dark .audit-card > summary{ color:#fff; }
  .ssm-results-dark .audit-card > summary::before{ color:rgba(255,255,255,.62); }
  .ssm-results-dark .audit-summary-title{ color:#fff; }
  .ssm-results-dark .audit-race-title{ color:rgba(255,255,255,.85); }
  .ssm-results-dark .audit-heat{ opacity:1; }
  .ssm-results-dark .audit-heat .audit-race-title{ color:rgba(255,255,255,.68); }
  .ssm-results-dark .audit-heat-note{ color:rgba(255,255,255,.62); }
  .ssm-results-dark .audit-overall{ border-top-color:rgba(255,255,255,.14); }
  .ssm-results-dark .hr{ background:rgba(255,255,255,.12); }

  /* Podium */
  .ssm-results-dark .podium-card{
    background:rgba(255,255,255,.05);
    border-color:rgba(255,255,255,.12);
  }
  .ssm-results-dark .podium-place{ color:#FCD34D; }
  .ssm-results-dark .podium-name{ color:#fff; }
  .ssm-results-dark .podium-team{ color:rgba(255,255,255,.68); }
  .ssm-results-dark .podium-pts{ color:#6EE7B7; }
  .ssm-results-dark .sponsor-line{ color:#7DD3FC; }

  /* Tables — standings and per-race audit.
     Zebra striping and a sticky header, because a real division is 12-30 rows
     and long dark lists are the one place this theme is weaker than light. */
  .ssm-results-dark .table th{
    color:rgba(255,255,255,.72);
    border-bottom-color:rgba(255,255,255,.16);
    background:#101c33;
    position:sticky;
    top:0;
    z-index:1;
  }
  /* Paint the rows an EXPLICIT dark — do not rely on transparency over the card,
     because the base .table sits on a light --card (#f8fafc) and any gap there
     renders white text on a white row. Solid dark cells are white-on-dark always. */
  .ssm-results-dark .table td{
    color:#fff;
    background:#111d34;
    border-bottom-color:rgba(255,255,255,.08);
  }
  .ssm-results-dark .table tbody tr:nth-child(even) td{
    background:#16233d;
  }
  .ssm-results-dark .table tr:hover td{ background:#1c2c4c; }
  .ssm-results-dark .table td .note{ color:#7DD3FC; }

  /* Tiebreaker + run-off */
  .ssm-results-dark .tb-badge{
    background:rgba(56,189,248,.14);
    border:1px solid rgba(56,189,248,.45);
    color:#7DD3FC;
  }
  .ssm-results-dark .tb-badge.tb-runoff{
    background:rgba(245,158,11,.18);
    border-color:rgba(245,158,11,.6);
    color:#FCD34D;
  }
  .ssm-results-dark tr.runoff-row td{
    background:rgba(245,158,11,.10);
    border-bottom-color:rgba(245,158,11,.28);
  }

  /* Record badge keeps its solid amber — it reads fine on dark. */

  /* Open + Quad accent cards keep their left borders; just fix the surface. */
  .ssm-results-dark .card[style*="border-left"]{
    background:rgba(255,255,255,.04);
  }

  /* Flash messages */
  .ssm-results-dark .good{ color:#6EE7B7; }
  .ssm-results-dark .bad,
  .ssm-results-dark .danger{ color:#FCA5A5; }

  /* Inputs and selects inside the results body */
  .ssm-results-dark input,
  .ssm-results-dark select,
  .ssm-results-dark textarea{
    background:rgba(255,255,255,.05);
    border-color:rgba(255,255,255,.16);
    color:#fff;
  }
  .ssm-results-dark select option{ color:#13213a; }
  .ssm-results-dark label{ color:rgba(255,255,255,.68); }

  @media(max-width:760px){
    .ssm-results-dark .table th{ position:static; }
  }

  /* Print keeps the existing black-on-white layout — the print route does not
     load this theme, and this guard covers anyone printing the screen page. */
  @media print{
    body:has(.ssm-results-dark){ background:#fff; }
    .ssm-results-dark,
    .ssm-results-dark h1,
    .ssm-results-dark h2,
    .ssm-results-dark h3,
    .ssm-results-dark .table td{ color:#111; }
    .ssm-results-dark .card,
    .ssm-results-dark details.result-section,
    .ssm-results-dark .podium-card,
    .ssm-results-dark .table th,
    .ssm-results-dark .table td,
    .ssm-results-dark .table tbody tr:nth-child(even) td{ background:#fff; border-color:#ccc; }
  }`;
}

module.exports = {
  resultsThemeCss,
};
