// Relay Builder quad integration: template rows carry discipline, the view
// renders a distinct Quad Relays section, and inline stays intact.
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRelayTemplates, RELAY_TEMPLATE_ROWS } = require('../services/relayHelpers');
const { renderRelayBuilderView } = require('../views/relayBuilderView');

test('template rows include quad divisions, tagged by discipline', () => {
  const inline = RELAY_TEMPLATE_ROWS.filter(r => r.discipline === 'inline').length;
  const quad = RELAY_TEMPLATE_ROWS.filter(r => r.discipline === 'quad').length;
  assert.equal(quad, 26);
  assert.ok(inline >= 36, 'inline rows preserved');
  assert.equal(RELAY_TEMPLATE_ROWS.length, inline + quad);
});

test('normalizeRelayTemplates carries discipline through', () => {
  const t = normalizeRelayTemplates([]);
  assert.equal(t.length, RELAY_TEMPLATE_ROWS.length);
  assert.ok(t.some(r => r.discipline === 'quad'));
  assert.ok(t.every(r => r.discipline === 'inline' || r.discipline === 'quad'));
});

test('relay builder renders a distinct Quad Relays section without losing inline', () => {
  const meet = { id: 'm1', relayTemplates: normalizeRelayTemplates([]), races: [] };
  const html = renderRelayBuilderView({ meet });
  assert.match(html, /Quad Relays/, 'quad section present');
  assert.match(html, /3 Person Relays/, 'inline 3-person still present');
  assert.match(html, /4 Person Relays/, 'inline 4-person still present');
});
