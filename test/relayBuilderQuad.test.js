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

test('relay builder tabs: inline + quad tab buttons with counts, quad panel hidden by default', () => {
  const templates = normalizeRelayTemplates([]);
  const inlineCount = templates.filter(r => r.discipline === 'inline').length;
  const quadCount = templates.filter(r => r.discipline === 'quad').length;
  const meet = { id: 'm1', relayTemplates: templates, races: [] };
  const html = renderRelayBuilderView({ meet });

  assert.ok(html.includes(`⚡ Inline Relays · ${inlineCount}`), 'inline tab button with count');
  assert.ok(html.includes(`🛼 Quad Relays · ${quadCount}`), 'quad tab button with count');
  assert.match(html, /id="relayTabQuad"[^>]*style="display:none"/, 'quad panel starts hidden');
  assert.ok(!/id="relayTabInline"[^>]*display:none/.test(html), 'inline panel starts visible');
  // Tab buttons must never submit the form.
  assert.match(html, /<button type="button" id="relayTabBtnInline"/);
  assert.match(html, /<button type="button" id="relayTabBtnQuad"/);
});

test('both tab panels live INSIDE the one form, so saving from either tab saves both disciplines', () => {
  const meet = { id: 'm1', relayTemplates: normalizeRelayTemplates([]), races: [] };
  const html = renderRelayBuilderView({ meet });
  const formOpen = html.indexOf('<form id="relayBuilderForm"');
  const formClose = html.indexOf('</form>', formOpen);
  const inlinePanel = html.indexOf('id="relayTabInline"');
  const quadPanel = html.indexOf('id="relayTabQuad"');
  assert.ok(formOpen !== -1 && formClose !== -1, 'form present');
  assert.ok(inlinePanel > formOpen && inlinePanel < formClose, 'inline panel inside the form');
  assert.ok(quadPanel > formOpen && quadPanel < formClose, 'quad panel inside the form');
});

test('a meet with zero quad template rows renders no quad tab (graceful degrade)', () => {
  const inlineOnly = normalizeRelayTemplates([]).filter(r => r.discipline === 'inline');
  const meet = { id: 'm1', relayTemplates: inlineOnly, races: [] };
  const html = renderRelayBuilderView({ meet });
  assert.ok(!html.includes('id="relayTabBtnQuad"'), 'no quad tab button');
  assert.ok(!html.includes('id="relayTabQuad"'), 'no quad panel');
  assert.ok(html.includes('id="relayTabInline"'), 'inline panel still renders');
});
