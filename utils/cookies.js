function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};

  raw
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(pair => {
      const idx = pair.indexOf('=');

      if (idx > -1) {
        out[pair.slice(0, idx)] =
          decodeURIComponent(pair.slice(idx + 1));
      }
    });

  return out;
}

function setCookie(res, name, value, maxAgeSec) {
  res.setHeader(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`
  );
}

function clearCookie(res, name) {
  res.setHeader(
    'Set-Cookie',
    `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

module.exports = {
  parseCookies,
  setCookie,
  clearCookie,
};