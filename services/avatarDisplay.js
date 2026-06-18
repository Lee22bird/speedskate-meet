const { esc } = require('../utils/html');

function initialsForName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'SS';
  return parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
}

function safeAvatarUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return '';
}

function avatarUrlFromSources(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const url = safeAvatarUrl(
      source.avatar_url ||
      source.profile_photo_url ||
      source.photo_url ||
      source.avatarUrl ||
      source.profilePhotoUrl ||
      source.photoUrl ||
      source.staff_avatar_url
    );
    if (url) return url;
  }
  return '';
}

function avatarHtml({ name = '', url = '', sizeClass = '' } = {}) {
  const safeUrl = safeAvatarUrl(url);
  const cls = ['staff-avatar', sizeClass].filter(Boolean).join(' ');
  const initials = initialsForName(name);
  if (safeUrl) {
    return `<span class="${esc(cls)}" data-initials="${esc(initials)}"><img src="${esc(safeUrl)}" alt="${esc(name || 'Skater avatar')}" loading="lazy" onerror="this.parentNode.textContent=this.parentNode.getAttribute('data-initials')||'SS'"></span>`;
  }
  return `<span class="${esc(cls)}">${esc(initials)}</span>`;
}

function skaterAvatarHtml(skater = {}, registration = {}, sizeClass = '') {
  const name = skater.skaterName || skater.skater || skater.name || registration.name || registration.skaterName || '';
  const url = avatarUrlFromSources(skater, registration);
  return avatarHtml({ name, url, sizeClass });
}

module.exports = {
  initialsForName,
  safeAvatarUrl,
  avatarUrlFromSources,
  avatarHtml,
  skaterAvatarHtml,
};
