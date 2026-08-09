const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');

const { safeFilename, streamScoreSheetsPdf } = require('../services/scoreSheetPdf');

class CaptureResponse extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.headers = {};
    this.statusCode = 0;
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  }

  body() {
    return Buffer.concat(this.chunks);
  }
}

function sampleSheet(raceNumber) {
  return {
    meetName: 'Wichita Spring Fling',
    date: '2026-04-24',
    raceNumber,
    division: `Division ${raceNumber}`,
    distance: '200m',
    stage: 'Final',
    raceType: 'Quad',
    startType: 'Standing',
    lanes: Array.from({ length: 7 }, (_, index) => ({
      lane: index + 1,
      helmetNumber: 100 + index,
      skaterName: `Test Skater ${index + 1}`,
      team: 'Test Team',
    })),
  };
}

test('score-sheet PDF streams a complete 138-race, 69-page packet', async () => {
  const groups = Array.from({ length: 69 }, (_, index) => ({
    compact: true,
    sheets: [sampleSheet(index * 2 + 1), sampleSheet(index * 2 + 2)],
  }));
  const response = new CaptureResponse();
  const finished = new Promise((resolve, reject) => {
    response.once('finish', resolve);
    response.once('error', reject);
  });

  streamScoreSheetsPdf(response, { meetName: 'Wichita Spring Fling', groups });
  await finished;

  const pdf = response.body();
  const pageObjects = pdf.toString('latin1').match(/\/Type \/Page\b/g) || [];
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/pdf');
  assert.match(response.headers['content-disposition'], /Wichita-Spring-Fling-score-sheets\.pdf/);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal(pageObjects.length, 69);
});

test('score-sheet PDF filenames are safe for response headers', () => {
  assert.equal(safeFilename('Meet / Weird: Name?!'), 'Meet-Weird-Name-score-sheets.pdf');
});
