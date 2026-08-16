// ── Meet Builder theme ───────────────────────────────────────────────────────
// Friendlier setup-dashboard restyle of /portal/meet/:id/builder.
//
// Ships three things:
//   meetBuilderThemeCss()   CSS — softer physics, colored section identity
//   builderHeaderHtml()     the compact header + progress ring
//   sectionHeadHtml()       one colored, numbered, icon'd section header
//
// What it deliberately does NOT touch:
//   • the division group cards and their toggles (.group-pair-col / .group-div-card
//     and the g_{gi}_{div}_ages|d1|d2|d3|d4 inputs) — these work well and stay as-is
//   • every field name, form id, action and formaction
//   • #meetBuilderForm → POST /builder/save, Save Meet → /builder/save-meet
//   • ownership, staff, desktop PIN and preset forms — only their ORDER changes
//
// Patch summary for views/meetBuilderView.js:
//   1. require this module
//   2. replace the <div class="builder-sticky-save"> block with builderHeaderHtml(...)
//   3. reorder the panels into the sequence below, each preceded by sectionHeadHtml(...)
//        1 Meet info          (existing Meet Setup card, identity + schedule + venue)
//        2 Registration/fees  (existing registration window + fee fields)
//        3 Race structure     (existing track length / lanes / tiebreaker)
//        4 Divisions          (existing groupsHtml — UNCHANGED)
//        5 Special events     (open/quad/relay grid-2 + Time Trial Builder card)
//        6 Save for next time (presets + desktopPinPanel + desktopImportPanel
//                              + ownershipPanel + staffPanel)

const { esc } = require('../utils/html');

const TONES = {
  sky:    { bg: '#f0f9ff', line: '#bae6fd', text: '#0369a1', tile: '#e0f2fe' },
  green:  { bg: '#ecfdf5', line: '#a7f3d0', text: '#047857', tile: '#d1fae5' },
  amber:  { bg: '#fff7ed', line: '#fed7aa', text: '#c2410c', tile: '#ffedd5' },
  violet: { bg: '#faf5ff', line: '#e9d5ff', text: '#6d28d9', tile: '#f3e8ff' },
  slate:  { bg: '#f8fafc', line: '#e2e8f0', text: '#475569', tile: '#f1f5f9' },
};

// state: 'done' | 'current' | 'optional' | 'todo'
function statePill(state, label) {
  const text = label || (state === 'done' ? '✓ Done'
    : state === 'current' ? 'You’re here'
    : state === 'optional' ? 'Optional' : 'Not yet');
  return `<span class="mb-pill mb-pill-${esc(state)}">${esc(text)}</span>`;
}

function sectionHeadHtml({ n, icon, tone = 'slate', title, sub, state = 'todo', pillLabel = '' }) {
  const t = TONES[tone] || TONES.slate;
  return `
    <div class="mb-head" style="background:${t.bg};border-bottom-color:${t.line}">
      <div class="mb-icon" style="background:${t.tile};border-color:${t.line}">
        <span class="mb-num">${esc(String(n))}</span>${icon}
      </div>
      <div class="mb-head-text">
        <div class="mb-title">${esc(title)}</div>
        ${sub ? `<div class="mb-sub" style="color:${t.text}">${esc(sub)}</div>` : ''}
      </div>
      ${statePill(state, pillLabel)}
    </div>`;
}

// steps: [{ done:Boolean }] — only the count is used, for the ring.
function builderHeaderHtml({ meet, statusLabel, statusBadgeClass, doneCount = 0, totalCount = 6, metaLine = '', encouragement = '' }) {
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  return `
    <div class="mb-hero">
      <div class="mb-ring" style="background:conic-gradient(#10b981 0% ${pct}%, rgba(255,255,255,.18) ${pct}% 100%)">
        <div class="mb-ring-inner">${doneCount}/${totalCount}</div>
      </div>
      <div class="mb-hero-text">
        <div class="mb-hero-titlerow">
          <span class="mb-hero-name">${esc(meet.meetName || 'Untitled Meet')}</span>
          <span id="builderStatusBadge" class="builder-status-badge ${statusBadgeClass}">${statusLabel}</span>
        </div>
        ${metaLine ? `<div class="mb-hero-meta">${esc(metaLine)}</div>` : ''}
        ${encouragement ? `<div class="mb-hero-note">${esc(encouragement)}</div>` : ''}
      </div>
      <div class="mb-hero-actions">
        <button class="btn-orange mb-save" type="submit" form="meetBuilderForm" formaction="/portal/meet/${esc(meet.id)}/builder/save-meet">Save Meet</button>
      </div>
    </div>`;
}

function meetBuilderThemeCss() {
  return `
  /* ── Section cards ─────────────────────────────────────────────── */
  .mb-section{
    background:#fff;
    border:1px solid #e2e8f0;
    border-radius:26px;
    box-shadow:0 8px 26px rgba(15,31,61,.07);
    overflow:hidden;
    margin-bottom:16px;
  }
  .mb-section.tone-sky{    border-color:#bae6fd; }
  .mb-section.tone-green{  border-color:#a7f3d0; }
  .mb-section.tone-amber{  border-color:#fed7aa; }
  .mb-section.tone-violet{ border-color:#e9d5ff; }
  .mb-section.tone-slate{  border-color:#e2e8f0; }
  .mb-body{ padding:20px 22px; }

  .mb-head{
    display:flex; align-items:center; gap:14px;
    padding:18px 22px; border-bottom:1px solid #e2e8f0;
  }
  .mb-icon{
    position:relative;
    display:flex; align-items:center; justify-content:center;
    width:52px; height:52px; flex:none;
    border-radius:18px; border:1.5px solid #e2e8f0;
    font-size:25px; line-height:1;
  }
  .mb-num{
    position:absolute; top:-8px; left:-8px;
    display:flex; align-items:center; justify-content:center;
    width:25px; height:25px; border-radius:50%;
    background:var(--navy,#13213a); color:#fff;
    font-size:12px; font-weight:800; line-height:1;
    border:2.5px solid #fff;
    box-shadow:0 2px 6px rgba(19,33,58,.25);
  }
  .mb-head-text{ min-width:0; }
  .mb-title{
    font-size:20px; font-weight:800; letter-spacing:-.025em;
    color:var(--navy,#13213a); line-height:1.2;
  }
  .mb-sub{ font-size:13.5px; font-weight:500; margin-top:2px; }

  .mb-pill{
    margin-left:auto; flex:none;
    display:inline-flex; align-items:center;
    padding:7px 14px; border-radius:999px;
    font-size:12.5px; font-weight:800; white-space:nowrap;
  }
  .mb-pill-done{     background:#047857; color:#fff; }
  .mb-pill-current{  background:var(--orange,#F97316); color:#fff; }
  .mb-pill-optional,
  .mb-pill-todo{     background:#fff; border:1.5px solid rgba(19,33,58,.16); color:#64748b; }

  /* ── Header ────────────────────────────────────────────────────── */
  .mb-hero{
    display:flex; align-items:center; gap:22px; flex-wrap:wrap;
    padding:22px 26px; margin-bottom:18px;
    border-radius:26px;
    background:linear-gradient(135deg,#13213a 0%,#1b2c4a 55%,#16294a 100%);
    box-shadow:0 12px 34px rgba(19,33,58,.18);
    position:sticky; top:8px; z-index:20;
  }
  .mb-ring{
    width:74px; height:74px; flex:none; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
  }
  .mb-ring-inner{
    width:58px; height:58px; border-radius:50%;
    background:#13213a; color:#fff;
    display:flex; align-items:center; justify-content:center;
    font-size:17px; font-weight:800;
  }
  .mb-hero-text{ flex:1; min-width:0; }
  .mb-hero-titlerow{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .mb-hero-name{
    font-size:27px; font-weight:800; letter-spacing:-.03em; color:#fff;
  }
  .mb-hero-meta{ font-size:14px; font-weight:600; color:rgba(255,255,255,.72); margin-top:5px; }
  .mb-hero-note{ font-size:13px; font-weight:650; color:#6EE7B7; margin-top:8px; }
  .mb-hero-actions{ flex:none; }
  .mb-save{
    min-height:50px; padding:0 26px; border-radius:16px;
    font-size:16px; font-weight:800;
    box-shadow:0 8px 22px rgba(249,115,22,.45);
  }
  .mb-hero .builder-status-badge{ flex:none; }

  /* The old sticky bar is replaced by .mb-hero. */
  .builder-sticky-save{ display:none !important; }

  /* ── Fee explainer ─────────────────────────────────────────────── */
  .mb-fee-explain{
    margin-top:18px; padding:16px 18px;
    border-radius:18px; background:#f0f9ff; border:1px solid #bae6fd;
  }
  .mb-fee-explain-title{ font-size:13px; font-weight:800; color:#0369a1; margin-bottom:9px; }
  .mb-fee-chips{ display:flex; gap:12px; flex-wrap:wrap; }
  .mb-fee-chip{
    display:inline-flex; align-items:baseline; gap:6px;
    padding:9px 15px; border-radius:14px; background:#fff; border:1px solid #bae6fd;
  }
  .mb-fee-chip strong{ font-size:18px; font-weight:800; color:var(--navy,#13213a); }
  .mb-fee-chip span{ font-size:12.5px; font-weight:600; color:#64748b; }
  .mb-fee-chip.is-cap{ background:#ecfdf5; border-color:#a7f3d0; }
  .mb-fee-chip.is-cap strong,
  .mb-fee-chip.is-cap span{ color:#047857; }

  /* ── Softer physics on the existing cards inside sections ──────── */
  .mb-body .card{ border-radius:20px; box-shadow:none; }
  .mb-body .setup-card{ border:0; padding:0; box-shadow:none; background:transparent; }
  .mb-body .setup-head{ display:none; }

  /* Division groups: only the container softens, the cards inside are untouched. */
  .mb-section .group-pair-col{ border-radius:20px; }

  @media(max-width:860px){
    .mb-hero{ position:static; padding:18px; gap:16px; }
    .mb-hero-name{ font-size:22px; }
    .mb-head{ padding:16px; gap:12px; }
    .mb-title{ font-size:17px; }
    .mb-icon{ width:46px; height:46px; font-size:22px; }
  }`;
}

module.exports = {
  meetBuilderThemeCss,
  builderHeaderHtml,
  sectionHeadHtml,
};
