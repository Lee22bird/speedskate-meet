const PDFDocument = require('pdfkit');

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 24;
const COMPACT_GAP = 10;
const COMPACT_HEIGHT = 360;

function clean(value) {
  return String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
}

function safeFilename(value) {
  const base = clean(value || 'meet')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return `${base || 'meet'}-score-sheets.pdf`;
}

function oneLine(doc, value, x, y, width, options = {}) {
  doc
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(options.size || 7)
    .fillColor(options.color || '#111111')
    .text(clean(value), x, y, {
      width,
      height: options.height || 11,
      lineBreak: false,
      ellipsis: true,
    });
}

function drawField(doc, label, value, x, y, width, compact) {
  oneLine(doc, String(label).toUpperCase(), x, y, width, {
    size: compact ? 5.2 : 6.2,
    color: '#555555',
    height: 7,
  });
  oneLine(doc, value, x, y + (compact ? 7 : 8), width, {
    size: compact ? 7.3 : 8.5,
    bold: true,
    height: compact ? 9 : 11,
  });
  const underlineY = y + (compact ? 17 : 20);
  doc.lineWidth(0.45).strokeColor('#888888').moveTo(x, underlineY).lineTo(x + width, underlineY).stroke();
}

function drawCheckbox(doc, label, x, y, compact) {
  const size = compact ? 4.5 : 6;
  doc.lineWidth(0.5).strokeColor('#222222').rect(x, y + 1, size, size).stroke();
  oneLine(doc, label, x + size + 3, y, compact ? 76 : 102, {
    size: compact ? 5.3 : 6.8,
    height: compact ? 8 : 10,
  });
}

function drawScoreSheet(doc, sheet, x, y, width, height, compact) {
  const pad = compact ? 8 : 13;
  const innerX = x + pad;
  const innerWidth = width - pad * 2;

  doc.lineWidth(1).strokeColor('#111111').rect(x, y, width, height).stroke();
  oneLine(doc, sheet.meetName || 'Meet', innerX, y + pad - 1, innerWidth - 54, {
    size: compact ? 11 : 16,
    bold: true,
    height: compact ? 13 : 19,
  });

  const qrSize = compact ? 40 : 64;
  doc.save().dash(3, { space: 2 }).lineWidth(0.5).strokeColor('#888888')
    .rect(x + width - pad - qrSize, y + pad, qrSize, qrSize).stroke().restore();

  const fieldRight = x + width - pad - qrSize - 10;
  const fieldWidth = (fieldRight - innerX) / 4;
  const fieldY = y + pad + (compact ? 17 : 25);
  drawField(doc, 'Date', sheet.date, innerX, fieldY, fieldWidth - 7, compact);
  drawField(doc, 'Race #', sheet.raceNumber, innerX + fieldWidth, fieldY, fieldWidth - 7, compact);
  drawField(doc, 'Division', sheet.division, innerX + fieldWidth * 2, fieldY, fieldWidth - 7, compact);
  drawField(doc, 'Distance', sheet.distance, innerX + fieldWidth * 3, fieldY, fieldWidth - 7, compact);

  const secondY = fieldY + (compact ? 21 : 25);
  drawField(doc, 'Heat / Final', sheet.stage, innerX, secondY, fieldWidth - 7, compact);
  drawField(doc, 'Race Type', sheet.raceType, innerX + fieldWidth, secondY, fieldWidth - 7, compact);
  drawField(doc, 'Start', sheet.startType, innerX + fieldWidth * 2, secondY, fieldWidth - 7, compact);

  const headerBottom = y + pad + (compact ? 58 : 83);
  doc.lineWidth(1.2).strokeColor('#111111').moveTo(innerX, headerBottom).lineTo(x + width - pad, headerBottom).stroke();

  const tableY = headerBottom + (compact ? 6 : 10);
  const tableWidth = innerWidth;
  const headers = ['Lane', 'Helmet', 'Skater Name', 'Team', 'Place', 'Status', 'Points', 'Notes'];
  const weights = [0.05, 0.10, 0.19, 0.19, 0.095, 0.095, 0.095, 0.185];
  const colWidths = weights.map(weight => tableWidth * weight);
  const headerHeight = compact ? 13 : 18;
  const lanes = Array.isArray(sheet.lanes) && sheet.lanes.length ? sheet.lanes : [{ lane: '', emptyMessage: 'No skaters assigned yet.' }];
  const footerSpace = compact ? 55 : 82;
  const availableRowsHeight = Math.max(20, height - (tableY - y) - headerHeight - footerSpace);
  const rowHeight = compact
    ? Math.min(22, availableRowsHeight / lanes.length)
    : Math.min(27, Math.max(12, availableRowsHeight / lanes.length));

  let cursorX = innerX;
  headers.forEach((header, index) => {
    doc.lineWidth(0.55).strokeColor('#111111').rect(cursorX, tableY, colWidths[index], headerHeight).stroke();
    oneLine(doc, header.toUpperCase(), cursorX + 3, tableY + (compact ? 3 : 5), colWidths[index] - 6, {
      size: compact ? 5.5 : 7,
      bold: true,
      height: compact ? 7 : 9,
    });
    cursorX += colWidths[index];
  });

  lanes.forEach((lane, rowIndex) => {
    const rowY = tableY + headerHeight + rowIndex * rowHeight;
    const values = lane.emptyMessage
      ? ['', '', lane.emptyMessage, '', '', '', '', '']
      : [lane.lane, lane.helmetNumber ? `#${clean(lane.helmetNumber)}` : '', lane.skaterName, lane.team, '', '', '', ''];
    cursorX = innerX;
    values.forEach((value, index) => {
      doc.lineWidth(0.45).strokeColor('#111111').rect(cursorX, rowY, colWidths[index], rowHeight).stroke();
      oneLine(doc, value, cursorX + 3, rowY + Math.max(3, (rowHeight - (compact ? 8 : 10)) / 2), colWidths[index] - 6, {
        size: compact ? 6.7 : 8.2,
        bold: index === 0,
        height: compact ? 8 : 10,
      });
      cursorX += colWidths[index];
    });
  });

  const tableBottom = tableY + headerHeight + lanes.length * rowHeight;
  oneLine(doc, 'Status key: DNS = Did Not Start  -  DNF = Did Not Finish  -  Scratch  -  DQ = Disqualified', innerX, tableBottom + 5, innerWidth, {
    size: compact ? 5.3 : 6.8,
    bold: true,
    color: '#333333',
    height: compact ? 8 : 10,
  });

  const checkboxY = tableBottom + (compact ? 17 : 22);
  const checkboxSpacing = innerWidth / 4;
  ['Photo Finish Used', 'Protest Filed', 'Rerace', 'Official Review'].forEach((label, index) => {
    drawCheckbox(doc, label, innerX + checkboxSpacing * index, checkboxY, compact);
  });

  const signatureY = y + height - (compact ? 17 : 25);
  const sigGap = compact ? 8 : 12;
  const sigWidths = [0.27, 0.27, 0.27, 0.13].map(weight => (innerWidth - sigGap * 3) * weight);
  const sigLabels = ['Chief Referee Signature', 'Assistant Referee', 'Starter', 'Time'];
  cursorX = innerX;
  sigLabels.forEach((label, index) => {
    doc.lineWidth(0.55).strokeColor('#111111').moveTo(cursorX, signatureY).lineTo(cursorX + sigWidths[index], signatureY).stroke();
    oneLine(doc, label.toUpperCase(), cursorX, signatureY + 3, sigWidths[index], {
      size: compact ? 4.8 : 6,
      color: '#555555',
      height: compact ? 7 : 9,
    });
    cursorX += sigWidths[index] + sigGap;
  });
}

function streamScoreSheetsPdf(res, { meetName, groups }) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: 'LETTER',
    margin: 0,
    bufferPages: false,
    info: {
      Title: `${clean(meetName || 'Meet')} Score Sheets`,
      Author: 'SpeedSkateMeet',
      Subject: 'Race score sheets',
    },
  });

  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename(meetName)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);

  const usableWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const fullHeight = PAGE_HEIGHT - PAGE_MARGIN * 2;
  if (!groups.length) {
    doc.addPage({ size: 'LETTER', margin: 0 });
    oneLine(doc, 'No races are available for this score-sheet selection.', PAGE_MARGIN, PAGE_MARGIN, usableWidth, {
      size: 12,
      bold: true,
      height: 18,
    });
  }
  groups.forEach(group => {
    doc.addPage({ size: 'LETTER', margin: 0 });
    if (group.compact && group.sheets.length === 2) {
      drawScoreSheet(doc, group.sheets[0], PAGE_MARGIN, PAGE_MARGIN, usableWidth, COMPACT_HEIGHT, true);
      drawScoreSheet(doc, group.sheets[1], PAGE_MARGIN, PAGE_MARGIN + COMPACT_HEIGHT + COMPACT_GAP, usableWidth, COMPACT_HEIGHT, true);
    } else if (group.compact) {
      drawScoreSheet(doc, group.sheets[0], PAGE_MARGIN, PAGE_MARGIN, usableWidth, COMPACT_HEIGHT, true);
    } else {
      drawScoreSheet(doc, group.sheets[0], PAGE_MARGIN, PAGE_MARGIN, usableWidth, fullHeight, false);
    }
  });

  doc.end();
}

module.exports = {
  safeFilename,
  streamScoreSheetsPdf,
};
