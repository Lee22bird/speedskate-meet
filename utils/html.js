function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cap(s) {
  const str = String(s || '');
  return str
    ? str.charAt(0).toUpperCase() + str.slice(1)
    : '';
}

module.exports = {
  esc,
  cap,
};