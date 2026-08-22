// Shared pdfkit primitives for SSM's printable reports (race list, block
// schedule, final results, DQ report). These are DISPLAY ONLY — every generator
// receives data already built by the same services the HTML print pages use, and
// none of them read or write results.
//
// services/scoreSheetPdf.js predates this and keeps its own private helpers; it
// is deliberately left untouched (it is production-proven paper output).

const PDFDocument = require('pdfkit');

const PAGE = { width: 612, height: 792, margin: 36 };
const INK = { text: '#111111', muted: '#666666', rule: '#999999', band: '#eef2f6' };

function clean(value) {
  return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
}

function safeFilename(name, suffix) {
  const base = clean(name || 'meet')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return `${base || 'meet'}-${suffix}.pdf`;
}

/// Starts a document that streams straight to the response.
function startDoc(res, { title, meetName, filename }) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: 'LETTER',
    margin: 0,
    info: { Title: `${clean(meetName || 'Meet')} — ${title}`, Author: 'SpeedSkateMeet', Subject: title },
  });
  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);
  return doc;
}

function text(doc, value, x, y, width, opts = {}) {
  doc
    .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(opts.size || 9)
    .fillColor(opts.color || INK.text)
    .text(clean(value), x, y, {
      width,
      align: opts.align || 'left',
      lineBreak: opts.wrap === true,
      ellipsis: opts.wrap !== true,
      height: opts.wrap === true ? undefined : (opts.height || (opts.size || 9) + 3),
    });
}

/// A cursor tracks the y position and adds pages as content overflows. Every
/// generator draws through it so long meets paginate correctly.
function makeCursor(doc, { title, meetName, subtitle }) {
  const usableWidth = PAGE.width - PAGE.margin * 2;
  const bottom = PAGE.height - PAGE.margin;
  let y = 0;
  let page = 0;

  function header() {
    page += 1;
    doc.addPage({ size: 'LETTER', margin: 0 });
    y = PAGE.margin;
    text(doc, meetName, PAGE.margin, y, usableWidth, { size: 15, bold: true });
    y += 19;
    text(doc, title, PAGE.margin, y, usableWidth, { size: 11, bold: true, color: INK.muted });
    if (subtitle) {
      text(doc, subtitle, PAGE.margin, y, usableWidth, { size: 9, color: INK.muted, align: 'right' });
    }
    y += 15;
    doc.lineWidth(1).strokeColor(INK.rule)
      .moveTo(PAGE.margin, y).lineTo(PAGE.width - PAGE.margin, y).stroke();
    y += 12;
  }

  return {
    get y() { return y; },
    set y(v) { y = v; },
    get width() { return usableWidth; },
    get x() { return PAGE.margin; },
    get pageNumber() { return page; },
    start() { if (page === 0) header(); },
    /// Ensure `need` points of vertical room, starting a new page if not.
    ensure(need) {
      this.start();
      if (y + need > bottom) header();
    },
    gap(n) { y += n; },
  };
}

/// A shaded section band (used for block names / division headers).
function sectionBand(doc, cur, label, right) {
  cur.ensure(26);
  doc.rect(cur.x, cur.y, cur.width, 18).fill(INK.band);
  text(doc, label, cur.x + 6, cur.y + 5, cur.width - 120, { size: 10, bold: true });
  if (right) {
    text(doc, right, cur.x + cur.width - 126, cur.y + 5, 120, { size: 9, color: INK.muted, align: 'right' });
  }
  cur.gap(24);
}

/// Draw a simple table. `columns` = [{ label, key, width, align }] where width is
/// a fraction of the usable width. Rows are plain objects.
function table(doc, cur, columns, rows, opts = {}) {
  const widths = columns.map(c => Math.floor(c.width * cur.width));
  const rowHeight = opts.rowHeight || 14;

  const drawHead = () => {
    cur.ensure(rowHeight + 4);
    let x = cur.x;
    columns.forEach((c, i) => {
      text(doc, c.label.toUpperCase(), x, cur.y, widths[i], { size: 7.5, bold: true, color: INK.muted, align: c.align });
      x += widths[i];
    });
    cur.gap(11);
    doc.lineWidth(0.6).strokeColor(INK.rule)
      .moveTo(cur.x, cur.y - 2).lineTo(cur.x + cur.width, cur.y - 2).stroke();
  };

  drawHead();
  let sincePage = cur.pageNumber;
  for (const row of rows) {
    cur.ensure(rowHeight);
    if (cur.pageNumber !== sincePage) { drawHead(); sincePage = cur.pageNumber; }
    let x = cur.x;
    columns.forEach((c, i) => {
      text(doc, row[c.key], x, cur.y, widths[i], { size: 9, align: c.align, bold: !!c.bold });
      x += widths[i];
    });
    cur.gap(rowHeight);
  }
  cur.gap(6);
}

function emptyState(doc, cur, message) {
  cur.ensure(20);
  text(doc, message, cur.x, cur.y, cur.width, { size: 10, color: INK.muted });
  cur.gap(16);
}

module.exports = { PAGE, INK, clean, safeFilename, startDoc, text, makeCursor, sectionBand, table, emptyState };
