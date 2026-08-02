const db = require('../utils/db');
const { formatServiceDetail, formatServiceDetailAsync } = require('../utils/serviceHelper');

const PUBLIC_SERVICE_FILTER = " AND s.name NOT LIKE '【定制】%' AND s.name NOT LIKE '【组团】%'";
const PROVIDER_PUBLISHED_FILTER = ' AND s.provider_id IS NOT NULL';
const USER_VISIBLE_SERVICE_FILTER = `${PUBLIC_SERVICE_FILTER}${PROVIDER_PUBLISHED_FILTER}`;

class Service {
  static findById(id) {
    return this.getById(id);
  }

  static async getTypes() {
    const sql = `
      SELECT st.*, COUNT(s.id) as service_count
      FROM service_types st
      LEFT JOIN services s ON s.type_id = st.id
        AND s.status = 1${USER_VISIBLE_SERVICE_FILTER}
      WHERE st.status = 1
      GROUP BY st.id
      ORDER BY st.sort_order ASC, st.id ASC
    `;
    return db.query(sql);
  }

  static async getHot(limit = 6) {
    const sql = `
      SELECT s.*, st.name as type_name,
             COUNT(o.id) as order_count
      FROM services s
      LEFT JOIN service_types st ON s.type_id = st.id
      LEFT JOIN orders o ON o.service_id = s.id
      WHERE s.status = 1${USER_VISIBLE_SERVICE_FILTER}
      GROUP BY s.id
      ORDER BY order_count DESC, s.created_at DESC
      LIMIT ?
    `;
    return db.query(sql, [parseInt(limit, 10)]);
  }

  static async getRecommend(limit = 8) {
    const sql = `
      SELECT s.*, st.name as type_name,
             COUNT(DISTINCT o.id) as order_count,
             COALESCE(
               (SELECT sp.avg_rating FROM service_providers sp WHERE sp.id = s.provider_id LIMIT 1),
               (SELECT sp.avg_rating FROM service_providers sp
                INNER JOIN users u ON u.id = s.provider_id AND u.role = 2
                  AND (u.openid = sp.openid OR u.phone = sp.phone)
                LIMIT 1),
               0
             ) AS rating
      FROM services s
      LEFT JOIN service_types st ON s.type_id = st.id
      LEFT JOIN orders o ON o.service_id = s.id
      WHERE s.status = 1${USER_VISIBLE_SERVICE_FILTER}
      GROUP BY s.id
      ORDER BY rating DESC, order_count DESC, s.created_at DESC
      LIMIT ?
    `;
    const rows = await db.query(sql, [parseInt(limit, 10)]);
    return rows.map((row) => ({
      ...row,
      rating: parseFloat(row.rating || 0).toFixed(1)
    }));
  }

  static async getOffers(status = 1) {
    try {
      const sql = `
        SELECT so.*, s.name as service_name, s.cover_image,
               s.base_price as original_price,
               so.offer_price,
               ROUND(so.offer_price / s.base_price * 10, 1) as discount
        FROM service_offers so
        LEFT JOIN services s ON so.service_id = s.id
        WHERE so.status = ? AND so.end_time > NOW()
        ORDER BY so.created_at DESC
      `;
      return db.query(sql, [status]);
    } catch (_) {
      return [];
    }
  }

  static async getAll({ type_id, level, price_range, page = 1, limit = 10 }) {
    let sql = `
      SELECT s.*, st.name as type_name,
             COUNT(o.id) as order_count
      FROM services s
      LEFT JOIN service_types st ON s.type_id = st.id
      LEFT JOIN orders o ON o.service_id = s.id
      WHERE s.status = 1${USER_VISIBLE_SERVICE_FILTER}
    `;
    const params = [];

    if (type_id) {
      sql += ' AND s.type_id = ?';
      params.push(parseInt(type_id, 10));
    }

    if (level) {
      sql += ' AND s.level_requirement = ?';
      params.push(parseInt(level, 10));
    }

    if (price_range && parseInt(price_range, 10) > 0) {
      const ranges = {
        1: [0, 50],
        2: [50, 100],
        3: [100, 200],
        4: [200, 999999]
      };
      const range = ranges[parseInt(price_range, 10)];
      if (range) {
        sql += ' AND s.base_price >= ? AND s.base_price < ?';
        params.push(range[0], range[1]);
      }
    }

    sql += ' GROUP BY s.id ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt((page - 1) * limit, 10));

    return db.query(sql, params);
  }

  static async getById(id) {
    const sql = `
      SELECT s.*, st.name as type_name,
             sp.nickname as provider_name, sp.avatar_url as provider_avatar
      FROM services s
      LEFT JOIN service_types st ON s.type_id = st.id
      LEFT JOIN service_providers sp ON s.provider_id = sp.id
      WHERE s.id = ?
    `;
    const rows = await db.query(sql, [id]);
    return rows[0];
  }

  static async getDetail(id) {
    const service = await this.getById(id);
    return formatServiceDetailAsync(service);
  }

  static async getByProvider(providerId, typeId = null) {
    const spId = parseInt(providerId, 10);
    let sql = `
      SELECT s.*, st.name as type_name,
             sp.nickname as provider_name, sp.avatar_url as provider_avatar,
             COUNT(o.id) as order_count
      FROM services s
      LEFT JOIN service_types st ON s.type_id = st.id
      LEFT JOIN service_providers sp ON s.provider_id = sp.id
        OR s.provider_id IN (
          SELECT u.id FROM users u
          INNER JOIN service_providers sp2 ON sp2.id = ?
            AND u.role = 2 AND (u.openid = sp2.openid OR u.phone = sp2.phone)
        )
      LEFT JOIN orders o ON o.service_id = s.id
      WHERE s.status = 1${USER_VISIBLE_SERVICE_FILTER} AND (
        s.provider_id = ? OR s.provider_id IN (
          SELECT u.id FROM users u
          INNER JOIN service_providers sp3 ON sp3.id = ?
            AND u.role = 2 AND (u.openid = sp3.openid OR u.phone = sp3.phone)
        )
      )
    `;
    const params = [spId, spId, spId];

    if (typeId) {
      sql += ' AND s.type_id = ?';
      params.push(parseInt(typeId, 10));
    }

    sql += ' GROUP BY s.id ORDER BY s.created_at DESC';
    return db.query(sql, params);
  }

  static async search({ keyword, type_id, price_range, level, limit = 20 }) {
    let sql = `
      SELECT s.*, st.name as type_name,
             COUNT(o.id) as order_count
      FROM services s
      LEFT JOIN service_types st ON s.type_id = st.id
      LEFT JOIN orders o ON o.service_id = s.id
      WHERE s.status = 1${USER_VISIBLE_SERVICE_FILTER}
    `;
    const params = [];

    if (keyword && keyword.trim()) {
      sql += ' AND (s.name LIKE ? OR s.description LIKE ?)';
      params.push(`%${keyword.trim()}%`, `%${keyword.trim()}%`);
    }

    if (type_id && parseInt(type_id, 10) > 0) {
      sql += ' AND s.type_id = ?';
      params.push(parseInt(type_id, 10));
    }

    if (price_range && parseInt(price_range, 10) > 0) {
      const ranges = {
        1: [0, 50],
        2: [50, 100],
        3: [100, 200],
        4: [200, 999999]
      };
      const range = ranges[parseInt(price_range, 10)];
      if (range) {
        sql += ' AND s.base_price >= ? AND s.base_price < ?';
        params.push(range[0], range[1]);
      }
    }

    if (level && parseInt(level, 10) > 0) {
      sql += ' AND s.level_requirement = ?';
      params.push(parseInt(level, 10));
    }

    sql += ' GROUP BY s.id ORDER BY order_count DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    return db.query(sql, params);
  }

  static async getByProvider(providerId, legacyUserId = null) {
    const ids = [parseInt(providerId, 10)];
    if (legacyUserId) {
      ids.push(parseInt(legacyUserId, 10));
    }
    const placeholders = ids.map(() => '?').join(', ');
    const sql = `
      SELECT s.*, st.name as type_name,
             COUNT(o.id) as order_count
      FROM services s
      LEFT JOIN service_types st ON s.type_id = st.id
      LEFT JOIN orders o ON o.service_id = s.id
      WHERE s.provider_id IN (${placeholders})
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `;
    return db.query(sql, ids);
  }

  static async create(data) {
    const {
      provider_id, name, description, type_id, base_price, cover_image, images,
      duration, weekdays, time_slots, service_area, card_type = 1, card_count = 1
    } = data;

    const normalizedCardType = parseInt(card_type, 10) === 2 ? 2 : 1;
    const normalizedCardCount = normalizedCardType === 2
      ? Math.max(parseInt(card_count, 10) || 2, 2)
      : 1;

    const sql = `
      INSERT INTO services (
        provider_id, name, description, type_id, base_price, cover_image, images,
        duration, weekdays, time_slots, service_area, card_type, card_count, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `;

    const result = await db.execute(sql, [
      parseInt(provider_id, 10),
      name,
      description,
      parseInt(type_id, 10),
      parseFloat(base_price),
      cover_image || '',
      images ? (typeof images === 'string' ? images : JSON.stringify(images)) : '[]',
      parseInt(duration, 10) || 60,
      weekdays ? JSON.stringify(weekdays) : JSON.stringify([1, 2, 3, 4, 5]),
      time_slots ? JSON.stringify(time_slots) : JSON.stringify([1, 3]),
      service_area || '',
      normalizedCardType,
      normalizedCardCount
    ]);

    const serviceId = result.insertId;
    if (normalizedCardType === 2) {
      await db.execute(
        'INSERT INTO service_packages (service_id, name, count, discount, price, status) VALUES (?, ?, ?, ?, ?, 1)',
        [serviceId, `${normalizedCardCount}次卡`, normalizedCardCount, 1, parseFloat(base_price) * normalizedCardCount]
      );
    }

    return serviceId;
  }

  static async update(data) {
    const {
      id, name, description, type_id, base_price, cover_image, images,
      duration, weekdays, time_slots, service_area, status, card_type, card_count
    } = data;

    const fields = [];
    const params = [];

    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (type_id !== undefined) { fields.push('type_id = ?'); params.push(parseInt(type_id, 10)); }
    if (base_price !== undefined) { fields.push('base_price = ?'); params.push(parseFloat(base_price)); }
    if (cover_image !== undefined) { fields.push('cover_image = ?'); params.push(cover_image); }
    if (images !== undefined) {
      fields.push('images = ?');
      params.push(typeof images === 'string' ? images : JSON.stringify(images));
    }
    if (duration !== undefined) { fields.push('duration = ?'); params.push(parseInt(duration, 10)); }
    if (weekdays !== undefined) { fields.push('weekdays = ?'); params.push(JSON.stringify(weekdays)); }
    if (time_slots !== undefined) { fields.push('time_slots = ?'); params.push(JSON.stringify(time_slots)); }
    if (service_area !== undefined) { fields.push('service_area = ?'); params.push(service_area); }
    if (status !== undefined) { fields.push('status = ?'); params.push(parseInt(status, 10)); }
    if (card_type !== undefined) {
      const normalizedCardType = parseInt(card_type, 10) === 2 ? 2 : 1;
      fields.push('card_type = ?');
      params.push(normalizedCardType);
    }
    if (card_count !== undefined) {
      fields.push('card_count = ?');
      params.push(parseInt(card_count, 10) || 1);
    }

    if (!fields.length) return;

    params.push(parseInt(id, 10));
    await db.execute(`UPDATE services SET ${fields.join(', ')} WHERE id = ?`, params);

    if (card_type !== undefined || card_count !== undefined || base_price !== undefined) {
      const service = await this.getById(id);
      if (service) {
        await db.execute('DELETE FROM service_packages WHERE service_id = ?', [id]);
        if (Number(service.card_type) === 2) {
          await db.execute(
            'INSERT INTO service_packages (service_id, name, count, discount, price, status) VALUES (?, ?, ?, ?, ?, 1)',
            [id, `${service.card_count}次卡`, service.card_count, 1, parseFloat(service.base_price) * service.card_count]
          );
        }
      }
    }
  }

  static async updateStatus(id, status, providerId = null) {
    let sql = 'UPDATE services SET status = ? WHERE id = ?';
    const params = [parseInt(status, 10), parseInt(id, 10)];

    if (providerId) {
      sql += ' AND provider_id = ?';
      params.push(parseInt(providerId, 10));
    }

    await db.execute(sql, params);
  }

  static async delete(id, providerId = null) {
    await db.execute('DELETE FROM service_packages WHERE service_id = ?', [id]);
    await db.execute('DELETE FROM provider_services WHERE service_id = ?', [id]);

    let sql = 'DELETE FROM services WHERE id = ?';
    const params = [parseInt(id, 10)];

    if (providerId) {
      sql += ' AND provider_id = ?';
      params.push(parseInt(providerId, 10));
    }

    await db.execute(sql, params);
  }
}

module.exports = Service;
