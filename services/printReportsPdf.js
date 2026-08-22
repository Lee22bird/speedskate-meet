// Printable PDF versions of SSM's four HTML print pages: race list, block
// schedule, final results, and the officials DQ report. These exist so the iPad
// (and anyone else) can AirPrint them the way score sheets already work — the
// HTML pages stay exactly as they are.
//
// DISPLAY ONLY. Every generator pulls its data from the SAME services the HTML
// pages use (orderedRaces/laneRowsForRace/computeMeetStandings/statusRowsForMeet
// ...), so nothing here recomputes scoring, placement, or race structure.

const { cap } = require('../utils/html');
const { raceDisplayStage, laneRowsForRace } = require('./raceDay');
const { meetRinkLabel, meetDateLabel } = require('./meetHelpers');
const { computeMeetStandings, computeOpenResults, computeQuadStandings } = require('./standings');
const { statusRowsForMeet } = require('./raceStatus');
const {
  timeTrialEventTitle, completedTimeTrialEvents, timeTrialResults,
} = require('./timeTrialEvents');
const {
  PAGE, startDoc, makeCursor, sectionBand, table, emptyState, text, safeFilename, clean, INK,
} = require('./reportPdf');

const DIVIDER_TYPES = new Set(['break', 'lunch', 'awards', 'practice']);
const DIVIDER_ICON = { break: 'Break', lunch: 'Lunch', awards: 'Awards', practice: 'Practice' };

function headerSubtitle(db, meet) {
  return [meetDateLabel(meet), meetRinkLabel(db, meet)].filter(Boolean).join(' · ');
}

// Every generator runs inside this guard: a mid-stream throw must still end the
// document, or the client (an iPad print dialog) waits on a truncated PDF
// forever. On failure we stamp an error line into the PDF itself.
function withDoc(res, meta, body) {
  const doc = startDoc(res, meta);
  try {
    body(doc);
  } catch (err) {
    console.error(`[printReportsPdf] ${meta.title} failed:`, err);
    try {
      doc.addPage({ size: 'LETTER', margin: 0 });
      text(doc, 'Report generation failed — see the server log.',
           PAGE.margin, PAGE.margin, PAGE.width - PAGE.margin * 2, { size: 11, bold: true });
    } catch (_) { /* already broken — just end */ }
  } finally {
    try { doc.end(); } catch (_) { /* stream already closed */ }
  }
}

// ── 1. Race list ───────────────────────────────────────────────────────────
// Mirrors the HTML page: blocks grouped by day, dividers called out, one global
// race counter across the whole meet.
function streamRaceListPdf(res, { db, meet }) {
  withDoc(res, {
    title: 'Race List', meetName: meet.meetName,
    filename: safeFilename(meet.meetName, 'race-list'),
  }, doc => {
    const cur = makeCursor(doc, {
      title: 'Race List', meetName: meet.meetName || 'Meet', subtitle: headerSubtitle(db, meet),
    });
    cur.start();

    const raceById = new Map((meet.races || []).filter(Boolean).map(r => [r.id, r]));
    const blocks = meet.blocks || [];
    const byDay = new Map();
    for (const b of blocks) {
      const day = b.day || 'Day 1';
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(b);
    }
    if (!blocks.length) { emptyState(doc, cur, 'No blocks yet.'); return; }

    const columns = [
      { label: 'Race', key: 'no', width: 0.08 },
      { label: 'Division', key: 'division', width: 0.32 },
      { label: 'Distance', key: 'distance', width: 0.15 },
      { label: 'Class', key: 'klass', width: 0.15 },
      { label: 'Stage', key: 'stage', width: 0.15 },
      { label: 'Start', key: 'start', width: 0.15 },
    ];

    let raceNo = 0;
    for (const day of [...byDay.keys()].sort()) {
      cur.ensure(30);
      text(doc, day, cur.x, cur.y, cur.width, { size: 12, bold: true });
      cur.gap(18);
      let blockNo = 0;
      for (const block of byDay.get(day)) {
        if (DIVIDER_TYPES.has(block.type)) {
          const label = `${DIVIDER_ICON[block.type] || 'Note'} — ${block.name || cap(block.type)}`;
          sectionBand(doc, cur, label, block.notes ? clean(block.notes).slice(0, 40) : '');
          continue;
        }
        blockNo += 1;
        sectionBand(doc, cur, block.name || `Block ${blockNo}`, block.notes ? clean(block.notes).slice(0, 40) : '');
        const rows = (block.raceIds || []).map(rid => raceById.get(rid)).filter(Boolean).map(race => {
          raceNo += 1;
          const flag = race.isOpenRace ? 'Open · ' : race.isQuadRace ? 'Quad · ' : '';
          return {
            no: String(raceNo),
            division: `${flag}${race.groupLabel || ''}`,
            distance: race.distanceLabel || '',
            klass: cap(race.division || ''),
            stage: raceDisplayStage(race),
            start: cap(race.startType || ''),
          };
        });
        if (!rows.length) emptyState(doc, cur, 'No races.');
        else table(doc, cur, columns, rows);
      }
    }
  });
}

// ── 2. Block schedule ──────────────────────────────────────────────────────
// Blocks in array order; per block, time-trial events FIRST then races — the
// same shared numbering the HTML page, orderedRaces, and the announcer board
// use, so "Race N" on this printout matches every other surface. Lane numbers
// are the REAL lanes (holes preserved); only merged packs renumber.
function streamBlockSchedulePdf(res, { db, meet, showEmpty = false }) {
  withDoc(res, {
    title: 'Block Schedule', meetName: meet.meetName,
    filename: safeFilename(meet.meetName, 'block-schedule'),
  }, doc => {
    const cur = makeCursor(doc, {
      title: 'Block Schedule', meetName: meet.meetName || 'Meet', subtitle: headerSubtitle(db, meet),
    });
    cur.start();

    const raceById = new Map((meet.races || []).filter(Boolean).map(r => [r.id, r]));
    const ttById = new Map((meet.timeTrialEvents || [])
      .filter(e => e && e.enabled !== false).map(e => [String(e.id), e]));
    const blocks = meet.blocks || [];
    if (!blocks.length) { emptyState(doc, cur, 'No blocks have been created.'); return; }

    const laneColumns = [
      { label: 'Lane', key: 'lane', width: 0.1 },
      { label: 'Helmet', key: 'helmet', width: 0.14 },
      { label: 'Skater', key: 'skater', width: 0.46 },
      { label: 'Team', key: 'team', width: 0.3 },
    ];
    const ttColumns = [
      { label: 'Order', key: 'order', width: 0.1 },
      { label: 'Skater', key: 'skater', width: 0.4 },
      { label: 'Team', key: 'team', width: 0.26 },
      { label: 'Gender', key: 'gender', width: 0.12 },
      { label: 'Time', key: 'time', width: 0.12, align: 'right' },
    ];

    const printableLanes = race => laneRowsForRace(race, meet)
      .filter(l => showEmpty || l.skaterName || l.team || l.helmetNumber);

    let scheduleNo = 0;
    const drawnMergeGroups = new Set();

    blocks.forEach((block, bi) => {
      const isDivider = DIVIDER_TYPES.has(block.type);
      sectionBand(doc, cur,
        block.name || (isDivider ? cap(block.type) : `Block ${bi + 1}`),
        block.day || 'Day 1');
      if (isDivider) { if (block.notes) emptyState(doc, cur, clean(block.notes)); return; }

      let drewAny = false;

      // Time-trial events first — they share the schedule counter with races.
      for (const eid of block.timeTrialEventIds || []) {
        const event = ttById.get(String(eid));
        if (!event) continue;
        scheduleNo += 1;
        drewAny = true;
        cur.ensure(34);
        text(doc, `Event ${scheduleNo} — ${timeTrialEventTitle(event)}`, cur.x, cur.y, cur.width, { size: 10.5, bold: true });
        cur.gap(13);
        text(doc, `Time Trial Event • Distance: ${event.distance || '100m'}`, cur.x, cur.y, cur.width, { size: 8.5, color: INK.muted });
        cur.gap(12);
        const ttRows = (event.participants || []).map((row, i) => ({
          order: String(i + 1),
          skater: row.skaterName || row.skater || row.name || '',
          team: row.team || '',
          gender: cap(row.gender || ''),
          time: row.time || '',
        }));
        if (ttRows.length) table(doc, cur, ttColumns, ttRows, { rowHeight: 13 });
        else emptyState(doc, cur, 'No registered Time Trial skaters.');
      }

      for (const rid of block.raceIds || []) {
        const race = raceById.get(rid);
        if (!race) continue;

        // Merged pack: draw once, combining members' lanes and renumbering.
        let members = [race];
        if (race.mergeGroupId) {
          if (drawnMergeGroups.has(race.mergeGroupId)) continue;
          drawnMergeGroups.add(race.mergeGroupId);
          members = (meet.races || [])
            .filter(r => r && r.mergeGroupId === race.mergeGroupId)
            .sort((a, b) => (a.mergeLead ? 0 : 1) - (b.mergeLead ? 0 : 1));
        }

        const rows = [];
        let pos = 0;
        for (const m of members) {
          for (const l of printableLanes(m)) {
            pos += 1;
            rows.push({
              // Real lane numbers — a cleared lane leaves a hole, and skaters
              // staged from this printout must match the judges' sheets. Only a
              // merged pack renumbers (it IS one physical lineup).
              lane: members.length > 1 ? String(pos) : String(l.lane ?? pos),
              helmet: l.helmetNumber ? `#${l.helmetNumber}` : '',
              skater: l.skaterName || '',
              team: members.length > 1 ? `${m.groupLabel || ''} · ${l.team || ''}` : (l.team || ''),
            });
          }
        }
        if (!rows.length && !showEmpty) continue;   // matches the HTML page's skip
        scheduleNo += 1;
        drewAny = true;

        const lead = members[0];
        const title = members.map(m => m.groupLabel || '').filter(Boolean).join(' & ');
        cur.ensure(34);
        text(doc, `Race ${scheduleNo} — ${title}`, cur.x, cur.y, cur.width, { size: 10.5, bold: true });
        cur.gap(13);
        const sub = [cap(lead.division || ''), lead.distanceLabel || '', raceDisplayStage(lead)]
          .filter(Boolean).join(' • ') + (members.length > 1 ? '   (raced together — scored separately)' : '');
        text(doc, sub, cur.x, cur.y, cur.width, { size: 8.5, color: INK.muted });
        cur.gap(12);
        if (rows.length) table(doc, cur, laneColumns, rows, { rowHeight: 13 });
        else emptyState(doc, cur, 'No skaters assigned.');
      }
      if (!drewAny) emptyState(doc, cur, 'No scheduled races in this block.');
    });
  });
}

// ── 3. Final results ───────────────────────────────────────────────────────
// Standings matrix per section (place / skater / one column per race / total),
// then Open, Quad, race-status, and time-trial results — the same order as the
// HTML page.
function streamFinalResultsPdf(res, { db, meet }) {
  withDoc(res, {
    title: 'Final Results', meetName: meet.meetName,
    filename: safeFilename(meet.meetName, 'final-results'),
  }, doc => {
    const cur = makeCursor(doc, {
      title: 'Final Results', meetName: meet.meetName || 'Meet', subtitle: headerSubtitle(db, meet),
    });
    cur.start();

    let printedAnything = false;

    const drawMatrix = (heading, section) => {
      const races = section.races || [];
      const standings = section.standings || [];
      cur.ensure(30);
      text(doc, heading, cur.x, cur.y, cur.width, { size: 11.5, bold: true });
      cur.gap(15);
      if (!standings.length) { emptyState(doc, cur, 'No scored results yet.'); return; }

      // Place + Skater + one column per race + Total, sized to fit the page.
      const raceShare = Math.min(0.5, 0.08 * races.length);
      const skaterShare = 0.92 - raceShare - 0.08;
      const columns = [
        { label: 'Pl', key: 'place', width: 0.07 },
        { label: 'Skater', key: 'skater', width: Math.max(0.22, skaterShare) },
        ...races.map((r, i) => ({
          label: r.distanceLabel || `R${i + 1}`,
          key: `r${i}`,
          width: races.length ? raceShare / races.length : 0.1,
          align: 'right',
        })),
        { label: 'Total', key: 'total', width: 0.09, align: 'right', bold: true },
      ];
      const rows = standings.map(row => {
        const out = {
          place: row.overallPlace == null ? '' : String(row.overallPlace),
          skater: [row.skaterName, row.team].filter(Boolean).join(' · '),
          total: row.totalPoints == null ? '' : String(row.totalPoints),
        };
        races.forEach((race, i) => {
          const hit = (row.raceScores || []).find(s => s.raceId === race.id);
          out[`r${i}`] = hit && Number(hit.place) > 0 ? String(hit.place) : '—';
        });
        return out;
      });
      table(doc, cur, columns, rows);
      printedAnything = true;
    };

    // A) Overall standings
    for (const section of (computeMeetStandings(meet) || [])) {
      drawMatrix(`${section.groupLabel} — ${cap(section.division || '')}`, section);
    }

    // B) Open results
    const openSections = computeOpenResults(meet) || [];
    if (openSections.length) {
      cur.ensure(26);
      text(doc, 'Open Results', cur.x, cur.y, cur.width, { size: 13, bold: true });
      cur.gap(18);
      for (const s of openSections) {
        cur.ensure(28);
        text(doc, `${s.race.groupLabel} — ${s.race.distanceLabel}`, cur.x, cur.y, cur.width, { size: 11, bold: true });
        cur.gap(14);
        const rows = (s.rows || []).map(r => ({
          place: String(r.place || ''), skater: r.skaterName || '', team: r.team || '',
        }));
        if (!rows.length) emptyState(doc, cur, 'No results.');
        else {
          table(doc, cur, [
            { label: 'Place', key: 'place', width: 0.12 },
            { label: 'Skater', key: 'skater', width: 0.52 },
            { label: 'Team', key: 'team', width: 0.36 },
          ], rows);
          printedAnything = true;
        }
      }
    }

    // C) Quad results
    const quadSections = computeQuadStandings(meet) || [];
    if (quadSections.length) {
      cur.ensure(26);
      text(doc, 'Quad Results', cur.x, cur.y, cur.width, { size: 13, bold: true });
      cur.gap(18);
      for (const section of quadSections) {
        drawMatrix(`${section.groupLabel} — ${section.distanceLabel || ''}`, section);
      }
    }

    // D) Race status (DNS/DNF/DQ/scratch)
    const statusRows = statusRowsForMeet(meet) || [];
    if (statusRows.length) {
      cur.ensure(26);
      text(doc, 'Race Status Results', cur.x, cur.y, cur.width, { size: 13, bold: true });
      cur.gap(18);
      table(doc, cur, [
        { label: 'Race', key: 'race', width: 0.4 },
        { label: 'Skater', key: 'skater', width: 0.26 },
        { label: 'Team', key: 'team', width: 0.19 },
        { label: 'Status', key: 'status', width: 0.15 },
      ], statusRows.map(r => ({
        race: r.raceLabel || '', skater: r.skaterName || '', team: r.team || '', status: r.statusLabel || '',
      })));
      printedAnything = true;
    }

    // E) Time trials — the HTML page prints these; a TT-only meet must not say
    // "No final results yet."
    const ttColumns = [
      { label: 'Place', key: 'place', width: 0.12 },
      { label: 'Skater', key: 'skater', width: 0.46 },
      { label: 'Team', key: 'team', width: 0.28 },
      { label: 'Time', key: 'time', width: 0.14, align: 'right' },
    ];
    for (const event of (completedTimeTrialEvents(meet) || [])) {
      const results = timeTrialResults(event);
      if (!results.overall.length) continue;
      cur.ensure(28);
      text(doc, `${event.distance || '100m'} Time Trials`, cur.x, cur.y, cur.width, { size: 13, bold: true });
      cur.gap(18);
      for (const [label, rows] of [['Overall', results.overall], ['Male', results.male], ['Female', results.female]]) {
        if (!rows.length) continue;
        cur.ensure(24);
        text(doc, `${label} Results`, cur.x, cur.y, cur.width, { size: 10.5, bold: true });
        cur.gap(14);
        table(doc, cur, ttColumns, rows.map(r => ({
          place: String(r.rank || ''), skater: r.skaterName || r.skater || '', team: r.team || '', time: r.time || '',
        })));
      }
      printedAnything = true;
    }

    if (!printedAnything) emptyState(doc, cur, 'No final results yet.');
  });
}

// ── 4. Officials DQ report ─────────────────────────────────────────────────
// Confidential officials paperwork: one block per disqualification with the
// ruling, rule reference, notes, and who recorded it — plus a blank entry and
// signature lines (USARS SR600.1).
function streamDqReportPdf(res, { db, meet, generatedAt }) {
  withDoc(res, {
    title: 'Officials Disqualification Report', meetName: meet.meetName,
    filename: safeFilename(meet.meetName, 'dq-report'),
  }, doc => {
    const cur = makeCursor(doc, {
      title: 'Officials Disqualification Report',
      meetName: meet.meetName || 'Meet',
      subtitle: headerSubtitle(db, meet),
    });
    cur.start();

    const rows = statusRowsForMeet(meet, { onlyDisqualifications: true }) || [];

    cur.ensure(30);
    text(doc, 'CONFIDENTIAL — OFFICIALS ONLY · Not for public distribution',
         cur.x, cur.y, cur.width, { size: 8.5, bold: true, color: INK.muted });
    cur.gap(12);
    const races = new Set(rows.map(r => r.raceId)).size;
    const cats = [...new Set(rows.map(r => r.dqCategoryLabel || r.statusLabel).filter(Boolean))];
    const summary = `${rows.length} disqualification(s) · ${races} race(s) affected`
      + (cats.length ? ` · ${cats.join(', ')}` : '');
    // Summary gets the left 2/3, the timestamp the right 1/3 — no overlap even
    // with a long category list.
    text(doc, summary, cur.x, cur.y, Math.floor(cur.width * 0.64), { size: 9 });
    const gw = Math.floor(cur.width * 0.33);
    text(doc, `Generated ${generatedAt || new Date().toLocaleString()}`,
         cur.x + cur.width - gw, cur.y, gw, { size: 8, color: INK.muted, align: 'right' });
    cur.gap(18);

    if (!rows.length) emptyState(doc, cur, 'No disqualifications recorded.');

    const rule = (label, width) => {
      doc.lineWidth(0.6).strokeColor(INK.rule)
        .moveTo(cur.x, cur.y + 14).lineTo(cur.x + width, cur.y + 14).stroke();
      text(doc, label, cur.x, cur.y + 17, width, { size: 7, color: INK.muted });
    };

    rows.forEach((r, i) => {
      // Notes box grows to fit the official's notes (capped to one page's worth,
      // clipped beyond that) so long rulings still print in full.
      let notesH = 34;
      if (r.dqOfficialNotes) {
        doc.font('Helvetica').fontSize(8.5);
        notesH = Math.min(400, Math.max(34, doc.heightOfString(String(r.dqOfficialNotes), { width: cur.width - 10 }) + 12));
      }
      cur.ensure(98 + notesH);
      sectionBand(doc, cur, `${i + 1}.  ${(r.raceLabel || '').toUpperCase()}`, r.statusLabel || '');
      const half = cur.width / 2;
      text(doc, 'SKATER', cur.x, cur.y, half, { size: 7, bold: true, color: INK.muted });
      text(doc, 'RULING', cur.x + half, cur.y, half, { size: 7, bold: true, color: INK.muted });
      cur.gap(10);
      text(doc, r.skaterName || '—', cur.x, cur.y, half - 8, { size: 11, bold: true });
      text(doc, r.statusLabel || '—', cur.x + half, cur.y, half, { size: 11, bold: true });
      cur.gap(13);
      text(doc, r.team || '', cur.x, cur.y, half - 8, { size: 8.5, color: INK.muted });
      text(doc, `Rule reference: ${r.dqRuleReference || '—'}`, cur.x + half, cur.y, half,
           { size: 8.5, color: INK.muted });
      cur.gap(16);
      text(doc, "OFFICIAL'S NOTES", cur.x, cur.y, cur.width, { size: 7, bold: true, color: INK.muted });
      cur.gap(10);
      doc.lineWidth(0.5).strokeColor(INK.rule).rect(cur.x, cur.y, cur.width, notesH).stroke();
      if (r.dqOfficialNotes) {
        text(doc, r.dqOfficialNotes, cur.x + 5, cur.y + 5, cur.width - 10,
             { size: 8.5, wrap: true, height: notesH - 8 });
      }
      cur.gap(notesH + 6);
      const third = cur.width / 3;
      text(doc, `Recorded by: ${r.dqRecordedBy || '—'}`, cur.x, cur.y, third, { size: 8 });
      const ts = r.dqTimestamp ? new Date(r.dqTimestamp).toLocaleString() : '—';
      text(doc, `Timestamp: ${ts}`, cur.x + third, cur.y, third, { size: 8 });
      text(doc, 'Protest / resolution: ______________', cur.x + third * 2, cur.y, third, { size: 8 });
      cur.gap(18);
    });

    // Blank entry for a DQ ruled after printing.
    cur.ensure(96);
    sectionBand(doc, cur, 'BLANK ENTRY', 'for a DQ ruled after printing');
    ['Race', 'Skater / helmet #', 'Category / rule'].forEach(label => {
      cur.ensure(30);
      rule(label, cur.width);
      cur.gap(28);
    });

    // Certification.
    cur.ensure(96);
    sectionBand(doc, cur, 'CERTIFICATION', '');
    [['Chief Referee — signature', 'Date'], ['Meet Director — signature', 'Date']].forEach(pair => {
      cur.ensure(38);
      const w = cur.width * 0.62;
      doc.lineWidth(0.6).strokeColor(INK.rule).moveTo(cur.x, cur.y + 18).lineTo(cur.x + w, cur.y + 18).stroke();
      text(doc, pair[0], cur.x, cur.y + 21, w, { size: 7, color: INK.muted });
      const dx = cur.x + w + 14;
      const dw = cur.width - w - 14;
      doc.lineWidth(0.6).strokeColor(INK.rule).moveTo(dx, cur.y + 18).lineTo(dx + dw, cur.y + 18).stroke();
      text(doc, pair[1], dx, cur.y + 21, dw, { size: 7, color: INK.muted });
      cur.gap(36);
    });
    cur.ensure(28);
    text(doc, 'USARS SR600.1 — disqualifications must be turned in to the chief placement judge before the next race or the DQ is nullified. Notes and rule references are internal officials records and are not published with results.',
         cur.x, cur.y, cur.width, { size: 7.5, color: INK.muted, wrap: true, height: 24 });
  });
}

module.exports = {
  streamRaceListPdf,
  streamBlockSchedulePdf,
  streamFinalResultsPdf,
  streamDqReportPdf,
};
