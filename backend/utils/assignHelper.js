const db = require('./db');

const DEFAULT_RULES = {
  user_select_enabled: true,
  auto_assign_enabled: true,
  prefer_same_city: true,
  candidate_count: 5,
  distance_weight: 25,
  level_weight: 20,
  rating_weight: 20,
  mutual_rating_weight: 15,
  service_count_weight: 10,
  response_speed_weight: 10,
  max_distance: 50,
  min_level: 1,
  min_rating: 3.5,
  exclude_busy: true,
  assign_timeout: 15,
  max_retries: 3,
  auto_to_manual: true
};

async function getAssignRules() {
  const rows = await db.query(
    'SELECT config_value FROM system_configs WHERE config_key = ?',
    ['assign_rules']
  );
  if (!rows.length) return { ...DEFAULT_RULES };
  try {
    return { ...DEFAULT_RULES, ...JSON.parse(rows[0].config_value) };
  } catch (_) {
    return { ...DEFAULT_RULES };
  }
}

async function getMutualRating(userId, providerId) {
  const rows = await db.query(
    `SELECT AVG(overall_rating) AS avg_rating
     FROM reviews
     WHERE user_id = ? AND provider_id = ? AND reviewer_type = 'provider'`,
    [userId, providerId]
  );
  return rows[0]?.avg_rating != null ? parseFloat(rows[0].avg_rating) : 3.5;
}

function scoreProvider(provider, rules, mutualRating) {
  const levelScore = Math.min((Number(provider.level) || 0) / 3, 1) * 100;
  const ratingScore = (Math.min(parseFloat(provider.rating || 0), 5) / 5) * 100;
  const serviceScore = Math.min((Number(provider.services || provider.service_count || 0) / 100), 1) * 100;
  const mutualScore = (Math.min(parseFloat(mutualRating || 3.5), 5) / 5) * 100;
  const responseScore = provider.available === 1 ? 100 : 40;

  const totalWeight = Math.max(
    (Number(rules.level_weight) || 0)
    + (Number(rules.rating_weight) || 0)
    + (Number(rules.mutual_rating_weight) || 0)
    + (Number(rules.service_count_weight) || 0)
    + (Number(rules.response_speed_weight) || 0),
    1
  );

  const weighted = (
    levelScore * (Number(rules.level_weight) || 0)
    + ratingScore * (Number(rules.rating_weight) || 0)
    + mutualScore * (Number(rules.mutual_rating_weight) || 0)
    + serviceScore * (Number(rules.service_count_weight) || 0)
    + responseScore * (Number(rules.response_speed_weight) || 0)
  ) / totalWeight;

  return Number(weighted.toFixed(2));
}

async function rankProviders(providers, userId = null, rules = null) {
  const assignRules = rules || await getAssignRules();
  const minLevel = Number(assignRules.min_level) || 1;
  const minRating = Number(assignRules.min_rating) || 0;

  const filtered = providers.filter((provider) => {
    if ((Number(provider.level) || 0) < minLevel) return false;
    if (parseFloat(provider.rating || 0) < minRating) return false;
    if (assignRules.exclude_busy && provider.available === 0) return false;
    return true;
  });

  const scored = [];
  for (const provider of filtered) {
    const mutualRating = userId ? await getMutualRating(userId, provider.id) : 3.5;
    scored.push({
      ...provider,
      mutual_rating: mutualRating.toFixed(1),
      match_score: scoreProvider(provider, assignRules, mutualRating)
    });
  }

  scored.sort((a, b) => b.match_score - a.match_score);
  const limit = Number(assignRules.candidate_count) || scored.length;
  return scored.slice(0, limit);
}

module.exports = {
  getAssignRules,
  rankProviders,
  scoreProvider,
  getMutualRating,
  DEFAULT_RULES
};
