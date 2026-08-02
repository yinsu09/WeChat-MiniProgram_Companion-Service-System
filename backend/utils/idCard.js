const PLACEHOLDER_PREFIX = 'N';

function normalizeIdCard(idCard, uniqueKey) {
  if (idCard === null || idCard === undefined) {
    return buildPlaceholder(uniqueKey);
  }
  const trimmed = String(idCard).trim();
  if (!trimmed) {
    return buildPlaceholder(uniqueKey);
  }
  return trimmed;
}

function buildPlaceholder(uniqueKey) {
  if (!uniqueKey) return null;
  const digits = String(uniqueKey).replace(/\D/g, '');
  const suffix = (digits || String(Date.now())).slice(-11);
  return `${PLACEHOLDER_PREFIX}${suffix}`;
}

function isPlaceholderIdCard(idCard) {
  return !idCard || String(idCard).startsWith(PLACEHOLDER_PREFIX);
}

module.exports = { normalizeIdCard, isPlaceholderIdCard, PLACEHOLDER_PREFIX };
