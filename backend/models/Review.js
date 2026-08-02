const db = require('../utils/db');

const BEHAVIOR_TAG_MAP = {
  1: { name: '准时到达', type: 'positive' },
  2: { name: '配合良好', type: 'positive' },
  3: { name: '沟通顺畅', type: 'positive' },
  4: { name: '态度友好', type: 'positive' },
  5: { name: '需求明确', type: 'positive' },
  6: { name: '迟到', type: 'negative' },
  7: { name: '临时取消', type: 'negative' },
  8: { name: '沟通困难', type: 'negative' },
  9: { name: '要求过多', type: 'negative' },
  10: { name: '爽约', type: 'negative' }
};

function parseJsonField(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function mapBehaviorTags(raw) {
  const ids = parseJsonField(raw, []);
  return ids.map((id) => {
    const tag = BEHAVIOR_TAG_MAP[id];
    return tag ? { id, name: tag.name, type: tag.type } : { id, name: `标签${id}`, type: 'positive' };
  });
}

function formatReviewTime(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toLocaleString('zh-CN', { hour12: false });
  }
  return String(value).replace('T', ' ').slice(0, 16);
}

function formatReviewRow(row, options = {}) {
  if (!row) return null;
  const { maskAnonymous = false } = options;
  const isAnonymous = Number(row.is_anonymous) === 1;
  const realName = row.user_name || '用户';
  const realAvatar = row.user_avatar || '';
  return {
    ...row,
    user_id: row.user_id,
    content: row.content || row.comment || '',
    overall_rating: Number(row.overall_rating) || 0,
    professional_rating: Number(row.professional_rating) || 0,
    attitude_rating: Number(row.attitude_rating) || 0,
    punctual_rating: Number(row.punctual_rating) || 0,
    cooperation_rating: Number(row.cooperation_rating) || 0,
    communication_rating: Number(row.communication_rating) || 0,
    is_anonymous: isAnonymous,
    user_name: maskAnonymous && isAnonymous ? '匿名用户' : realName,
    user_avatar: maskAnonymous && isAnonymous ? '' : realAvatar,
    images: parseJsonField(row.images, []),
    behavior_tags: mapBehaviorTags(row.behavior_tags),
    created_at: formatReviewTime(row.created_at)
  };
}

class Review {
  static async exists(orderId, reviewerType) {
    const rows = await db.query(
      'SELECT id FROM reviews WHERE order_id = ? AND reviewer_type = ? LIMIT 1',
      [orderId, reviewerType]
    );
    return rows.length > 0;
  }

  static async createUserReview(data) {
    const sql = `
      INSERT INTO reviews (
        order_id, reviewer_type, user_id, provider_id, service_id,
        overall_rating, professional_rating, attitude_rating, punctual_rating,
        content, images, is_anonymous, created_at
      ) VALUES (?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    const result = await db.execute(sql, [
      data.order_id,
      data.user_id,
      data.provider_id,
      data.service_id || null,
      data.overall_rating,
      data.professional_rating,
      data.attitude_rating,
      data.punctual_rating,
      data.content || '',
      data.images,
      data.is_anonymous ? 1 : 0
    ]);
    return { id: result.insertId, ...data, reviewer_type: 'user' };
  }

  static async createProviderReview(data) {
    const overall = data.overall_rating
      || Math.round((data.attitude_rating + data.cooperation_rating + data.communication_rating) / 3 * 2) / 2;

    const sql = `
      INSERT INTO reviews (
        order_id, reviewer_type, user_id, provider_id, service_id,
        overall_rating, attitude_rating, cooperation_rating, communication_rating,
        content, behavior_tags, created_at
      ) VALUES (?, 'provider', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    const result = await db.execute(sql, [
      data.order_id,
      data.user_id,
      data.provider_id,
      data.service_id || null,
      overall,
      data.attitude_rating,
      data.cooperation_rating,
      data.communication_rating,
      data.content || '',
      data.behavior_tags
    ]);
    return { id: result.insertId, ...data, overall_rating: overall, reviewer_type: 'provider' };
  }

  static async getUserReviewsOfProvider(providerId, page = 1, limit = 50, maskAnonymous = false) {
    const offset = (page - 1) * limit;
    const rows = await db.query(
      `SELECT r.*, u.nickname AS user_name, u.avatar_url AS user_avatar,
              s.name AS service_name, p.nickname AS provider_name, p.avatar_url AS provider_avatar,
              p.level AS provider_level
       FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN services s ON r.service_id = s.id
       LEFT JOIN service_providers p ON r.provider_id = p.id
       WHERE r.provider_id = ? AND r.reviewer_type = 'user'
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [providerId, limit, offset]
    );
    return rows.map((row) => formatReviewRow(row, { maskAnonymous }));
  }

  static async getReviewsWrittenByUser(userId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const rows = await db.query(
      `SELECT r.*, p.nickname AS provider_name, p.avatar_url AS provider_avatar,
              p.level AS provider_level, s.name AS service_name
       FROM reviews r
       LEFT JOIN service_providers p ON r.provider_id = p.id
       LEFT JOIN services s ON r.service_id = s.id
       WHERE r.user_id = ? AND r.reviewer_type = 'user'
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
    return rows.map((row) => formatReviewRow(row));
  }

  static async getReviewsForUserFromProvider(userId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const rows = await db.query(
      `SELECT r.*, p.nickname AS provider_name, p.avatar_url AS provider_avatar,
              p.level AS provider_level, s.name AS service_name
       FROM reviews r
       LEFT JOIN service_providers p ON r.provider_id = p.id
       LEFT JOIN services s ON r.service_id = s.id
       WHERE r.user_id = ? AND r.reviewer_type = 'provider'
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
    return rows.map(formatReviewRow);
  }

  static async getReviewsWrittenByProvider(providerId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const rows = await db.query(
      `SELECT r.*, u.nickname AS user_name, u.avatar_url AS user_avatar,
              s.name AS service_name, p.nickname AS provider_name, p.avatar_url AS provider_avatar,
              p.level AS provider_level
       FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN services s ON r.service_id = s.id
       LEFT JOIN service_providers p ON r.provider_id = p.id
       WHERE r.provider_id = ? AND r.reviewer_type = 'provider'
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [providerId, limit, offset]
    );
    return rows.map(formatReviewRow);
  }

  static async getByOrderId(orderId, reviewerType = null) {
    let sql = `
      SELECT r.*, u.nickname AS user_name, p.nickname AS provider_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN service_providers p ON r.provider_id = p.id
      WHERE r.order_id = ?
    `;
    const params = [orderId];
    if (reviewerType) {
      sql += ' AND r.reviewer_type = ?';
      params.push(reviewerType);
    }
    const rows = await db.query(sql, params);
    if (reviewerType) {
      return rows.length ? formatReviewRow(rows[0]) : null;
    }
    return rows.map(formatReviewRow);
  }

  static async getProviderStats(providerId) {
    const rows = await db.query(
      `SELECT
         COUNT(*) AS total_reviews,
         AVG(overall_rating) AS avg_rating,
         AVG(professional_rating) AS avg_professional,
         AVG(attitude_rating) AS avg_attitude,
         AVG(punctual_rating) AS avg_punctual,
         SUM(CASE WHEN overall_rating >= 4 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) AS good_rate
       FROM reviews
       WHERE provider_id = ? AND reviewer_type = 'user'`,
      [providerId]
    );
    const stats = rows[0] || {};
    return {
      totalReviews: stats.total_reviews || 0,
      avgRating: parseFloat(stats.avg_rating || 0).toFixed(1),
      avgProfessional: parseFloat(stats.avg_professional || 0).toFixed(1),
      avgAttitude: parseFloat(stats.avg_attitude || 0).toFixed(1),
      avgPunctual: parseFloat(stats.avg_punctual || 0).toFixed(1),
      goodRate: Math.round(stats.good_rate || 0)
    };
  }

  static async updateProviderStats(providerId) {
    const stats = await this.getProviderStats(providerId);
    await db.execute(
      'UPDATE service_providers SET avg_rating = ? WHERE id = ?',
      [stats.avgRating, providerId]
    );
  }

  static encodeBehaviorTags(tagIds) {
    return JSON.stringify(Array.isArray(tagIds) ? tagIds : []);
  }
}

module.exports = Review;
