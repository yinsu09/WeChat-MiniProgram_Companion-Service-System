const db = require('../utils/db');
const { getLevelName, getLevelColor } = require('../utils/providerLevel');

const TYPE_NAMES = {
  1: '陪诊', 2: '陪护', 3: '陪玩', 4: '陪吃', 5: '陪游', 6: '陪学', 7: '陪聊'
};

function formatServiceTypes(serviceTypes) {
  if (!serviceTypes) return '';
  try {
    const types = typeof serviceTypes === 'string' ? JSON.parse(serviceTypes) : serviceTypes;
    if (!Array.isArray(types)) return '';
    return types.map((id) => TYPE_NAMES[id] || '').filter(Boolean).join('、');
  } catch (_) {
    return '';
  }
}

function getStars(rating) {
  const value = parseFloat(rating) || 0;
  const fullStars = Math.floor(value);
  const hasHalfStar = value - fullStars >= 0.5;
  let stars = '';
  for (let i = 0; i < fullStars; i += 1) stars += '⭐';
  if (hasHalfStar) stars += '⭐';
  return stars;
}

function mapDisplayStatus(spStatus, available, userStatus = 1) {
  if (Number(spStatus) === 0 || Number(userStatus) === 0) return 'disabled';
  if (Number(spStatus) === 2) return 'offline';
  if (Number(available) === 0) return 'busy';
  return 'idle';
}

const STATUS_TEXTS = {
  idle: '空闲',
  busy: '忙碌',
  offline: '审核中',
  disabled: '已禁用'
};

function mapProviderRow(row) {
  const rating = parseFloat(row.rating || row.avg_rating || 0);
  return {
    id: row.id,
    name: row.nickname || row.name || '服务人员',
    nickname: row.nickname || row.name || '服务人员',
    avatar_url: row.avatar_url || '',
    level: row.level || 0,
    level_name: getLevelName(row.level || 0),
    level_color: getLevelColor(row.level || 0),
    rating: rating.toFixed(1),
    stars: getStars(rating),
    service_count: row.service_count || row.total_services || 0,
    service_types: formatServiceTypes(row.service_types),
    min_price: row.min_price != null ? parseFloat(row.min_price).toFixed(0) : '0',
    service_area: row.service_area || ''
  };
}

function mapSearchProviderRow(row) {
  const base = mapProviderRow(row);
  const spStatus = row.account_status ?? row.sp_status ?? 1;
  const available = row.available ?? 1;
  const userStatus = row.user_status != null ? row.user_status : 1;
  const status = mapDisplayStatus(spStatus, available, userStatus);
  return {
    ...base,
    status,
    status_text: STATUS_TEXTS[status] || '未知'
  };
}

function buildProviderSearchSql() {
  return `
    SELECT sp.id, sp.nickname, sp.avatar_url, sp.level, sp.avg_rating AS rating,
           sp.total_services AS service_count, sp.status AS account_status, sp.available,
           sp.phone AS sp_phone, u.service_types, u.service_area, u.status AS user_status,
           u.nickname AS user_nickname, u.phone AS user_phone,
           IFNULL(MIN(s.base_price), 0) AS min_price
    FROM service_providers sp
    LEFT JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
    LEFT JOIN services s ON s.provider_id = sp.id AND s.status = 1
      AND s.name NOT LIKE '【定制】%' AND s.name NOT LIKE '【组团】%'
    WHERE 1=1
  `;
}

function buildProviderBaseSql() {
  return `
    SELECT sp.id, sp.nickname, sp.avatar_url, sp.level, sp.avg_rating AS rating,
           sp.total_services AS service_count, u.service_types, u.service_area,
           IFNULL(MIN(s.base_price), 0) AS min_price
    FROM service_providers sp
    LEFT JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
    LEFT JOIN services s ON s.provider_id = sp.id AND s.status = 1
      AND s.name NOT LIKE '【定制】%' AND s.name NOT LIKE '【组团】%'
    WHERE sp.status = 1
  `;
}

class ServiceProvider {
  static async getRecommend(limit = 5) {
    const lim = parseInt(limit, 10);
    let rows = await db.query(
      `${buildProviderBaseSql()}
       GROUP BY sp.id, sp.nickname, sp.avatar_url, sp.level, sp.avg_rating,
                sp.total_services, u.service_types, u.service_area
       ORDER BY sp.avg_rating DESC, sp.total_services DESC, sp.id DESC
       LIMIT ?`,
      [lim]
    );
    if (!rows.length) {
      rows = await db.query(
        `SELECT id, nickname, avatar_url, level, avg_rating AS rating,
                total_services AS service_count, 0 AS min_price, NULL AS service_types, NULL AS service_area
         FROM service_providers
         WHERE status = 1
         ORDER BY avg_rating DESC, total_services DESC, id DESC
         LIMIT ?`,
        [lim]
      );
    }
    return rows.map(mapProviderRow);
  }

  static async getAll({ type_id, level, page = 1, limit = 10 }) {
    let sql = buildProviderBaseSql();
    const params = [];

    if (type_id) {
      sql += ' AND JSON_CONTAINS(u.service_types, ?)';
      params.push(JSON.stringify(parseInt(type_id, 10)));
    }

    if (level) {
      sql += ' AND sp.level >= ?';
      params.push(parseInt(level, 10));
    }

    sql += ' GROUP BY sp.id ORDER BY sp.avg_rating DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), (parseInt(page, 10) - 1) * parseInt(limit, 10));

    const rows = await db.query(sql, params);
    return rows.map(mapProviderRow);
  }

  static async getById(id) {
    const rows = await db.query(
      `${buildProviderBaseSql()} AND sp.id = ?
       GROUP BY sp.id`,
      [id]
    );
    return rows.length ? mapProviderRow(rows[0]) : null;
  }

  static async search({ keyword, type_id, level, limit = 20 }) {
    let sql = buildProviderSearchSql();
    const params = [];

    if (keyword && String(keyword).trim()) {
      const kw = `%${String(keyword).trim()}%`;
      sql += ` AND (
        sp.nickname LIKE ? OR sp.real_name LIKE ? OR sp.phone LIKE ?
        OR u.nickname LIKE ? OR u.phone LIKE ? OR u.service_area LIKE ?
      )`;
      params.push(kw, kw, kw, kw, kw, kw);
    }

    const typeId = parseInt(type_id, 10);
    if (typeId > 0) {
      sql += ` AND (
        JSON_CONTAINS(COALESCE(u.service_types, '[]'), ?)
        OR EXISTS (
          SELECT 1 FROM services sv
          WHERE sv.provider_id = sp.id AND sv.type_id = ? AND sv.status = 1
            AND sv.name NOT LIKE '【定制】%' AND sv.name NOT LIKE '【组团】%'
        )
      )`;
      params.push(JSON.stringify(typeId), typeId);
    }

    const levelNum = parseInt(level, 10);
    if (levelNum > 0) {
      sql += ' AND sp.level >= ?';
      params.push(levelNum);
    }

    sql += ` GROUP BY sp.id, sp.nickname, sp.avatar_url, sp.level, sp.avg_rating,
                      sp.total_services, sp.status, sp.available, sp.phone,
                      u.service_types, u.service_area, u.status, u.nickname, u.phone
             ORDER BY sp.status DESC, sp.avg_rating DESC, sp.id DESC
             LIMIT ?`;
    params.push(parseInt(limit, 10));

    const rows = await db.query(sql, params);
    return rows.map(mapSearchProviderRow);
  }
}

module.exports = ServiceProvider;
