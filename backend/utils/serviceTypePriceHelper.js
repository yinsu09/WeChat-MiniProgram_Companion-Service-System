const db = require('./db');
const { getLevelName } = require('./providerLevel');

const DEFAULT_RANGES = {
  0: { min: 30, max: 80 },
  1: { min: 50, max: 120 },
  2: { min: 80, max: 200 },
  3: { min: 120, max: 500 }
};

function parseLevelPriceRanges(raw) {
  if (!raw) return { ...DEFAULT_RANGES };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const result = { ...DEFAULT_RANGES };
    for (const key of ['0', '1', '2', '3']) {
      const item = parsed[key] ?? parsed[Number(key)];
      if (item && item.min != null && item.max != null) {
        result[Number(key)] = {
          min: parseFloat(item.min),
          max: parseFloat(item.max)
        };
      }
    }
    return result;
  } catch (_) {
    return { ...DEFAULT_RANGES };
  }
}

async function getTypePriceRanges(typeId) {
  const rows = await db.query('SELECT level_price_ranges FROM service_types WHERE id = ?', [typeId]);
  return parseLevelPriceRanges(rows[0]?.level_price_ranges);
}

async function getProviderLevel(providerId) {
  const rows = await db.query('SELECT level FROM service_providers WHERE id = ?', [providerId]);
  return rows.length ? Number(rows[0].level) || 0 : 0;
}

async function getPriceRangeForProvider(typeId, providerId) {
  const level = await getProviderLevel(providerId);
  const ranges = await getTypePriceRanges(typeId);
  const range = ranges[level] || ranges[0];
  return {
    level,
    level_name: getLevelName(level),
    min: range.min,
    max: range.max
  };
}

async function validateServicePrice(typeId, providerId, basePrice) {
  const price = parseFloat(basePrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('请填写有效的服务价格');
  }
  const { min, max, level_name } = await getPriceRangeForProvider(typeId, providerId);
  if (price < min || price > max) {
    throw new Error(`${level_name}定价须在 ¥${min} - ¥${max} 区间内`);
  }
  return true;
}

module.exports = {
  parseLevelPriceRanges,
  getTypePriceRanges,
  getPriceRangeForProvider,
  validateServicePrice,
  DEFAULT_RANGES
};
