const db = require('./db');

const LEVEL_NAMES = {
  0: '新手服务',
  1: '铜牌服务',
  2: '银牌服务',
  3: '金牌服务'
};

const LEVEL_COLORS = {
  0: '#91d5ff',
  1: '#d9d9d9',
  2: '#faad14',
  3: '#ff6b6b'
};

async function getLevelRules() {
  const result = await db.query(
    'SELECT config_value FROM system_configs WHERE config_key = ?',
    ['provider_level_rules']
  );
  if (result.length > 0) {
    return JSON.parse(result[0].config_value);
  }
  return {
    service_count: { bronze: 0, silver: 50, gold: 100 },
    rating: { bronze: 3.0, silver: 4.0, gold: 4.5 },
    demote: { bad_review_count: 5, min_rating: 3.5 }
  };
}

function calculateLevel(serviceCount, avgRating, rules) {
  const count = Number(serviceCount) || 0;
  const rating = Number(avgRating) || 0;
  const sc = rules.service_count || {};
  const rt = rules.rating || {};

  if (count >= (sc.gold ?? 100) && rating >= (rt.gold ?? 4.5)) return 3;
  if (count >= (sc.silver ?? 50) && rating >= (rt.silver ?? 4.0)) return 2;
  if (count >= (sc.bronze ?? 0) && rating >= (rt.bronze ?? 3.0)) return 1;
  return 0;
}

function getLevelName(level) {
  return LEVEL_NAMES[level] ?? LEVEL_NAMES[0];
}

function getLevelColor(level) {
  return LEVEL_COLORS[level] ?? LEVEL_COLORS[0];
}

async function getProviderMetrics(providerId) {
  const providers = await db.query(
    'SELECT openid, phone, avg_rating, total_services FROM service_providers WHERE id = ?',
    [providerId]
  );
  if (!providers.length) {
    return { serviceCount: 0, avgRating: 0 };
  }

  const provider = providers[0];
  const orders = await db.query(
    'SELECT COUNT(*) as completed FROM orders WHERE provider_id = ? AND status = 4',
    [providerId]
  );
  const serviceCount = Number(orders[0]?.completed ?? provider.total_services ?? 0);

  let avgRating = parseFloat(provider.avg_rating || 0);
  const reviews = await db.query(
    `SELECT AVG(overall_rating) AS avg_rating FROM reviews
     WHERE provider_id = ? AND reviewer_type = 'user'`,
    [providerId]
  );
  if (reviews[0]?.avg_rating != null) {
    avgRating = parseFloat(reviews[0].avg_rating);
  }

  return { serviceCount, avgRating: avgRating || 0 };
}

async function recalculateProviderLevel(providerId) {
  const rules = await getLevelRules();
  const { serviceCount, avgRating } = await getProviderMetrics(providerId);
  let level = calculateLevel(serviceCount, avgRating, rules);

  const demote = rules.demote || {};
  const minRating = Number(demote.min_rating) || 3.5;
  const badThreshold = Number(demote.bad_review_count) || 5;
  const badReviews = await db.query(
    `SELECT COUNT(*) AS count FROM reviews
     WHERE provider_id = ? AND reviewer_type = 'user' AND overall_rating < ?`,
    [providerId, minRating]
  );
  const badCount = Number(badReviews[0]?.count) || 0;

  if (badCount >= badThreshold || avgRating < minRating) {
    level = Math.max(0, level - 1);
  }

  await db.execute(
    'UPDATE service_providers SET level = ?, total_services = ?, avg_rating = ? WHERE id = ?',
    [level, serviceCount, avgRating.toFixed(2), providerId]
  );

  return {
    level,
    level_name: getLevelName(level),
    level_color: getLevelColor(level),
    serviceCount,
    avgRating,
    bad_review_count: badCount,
    demoted: badCount >= badThreshold || avgRating < minRating
  };
}

async function recalculateAllProviderLevels() {
  const providers = await db.query('SELECT id FROM service_providers');
  for (const provider of providers) {
    await recalculateProviderLevel(provider.id);
  }
}

module.exports = {
  LEVEL_NAMES,
  LEVEL_COLORS,
  getLevelRules,
  calculateLevel,
  getLevelName,
  getLevelColor,
  getProviderMetrics,
  recalculateProviderLevel,
  recalculateAllProviderLevels
};
