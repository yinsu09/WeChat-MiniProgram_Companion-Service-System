const db = require('../utils/db');
const Review = require('../models/Review');
const { formatServiceDetail, cleanupOrphanServices } = require('../utils/serviceHelper');
const { enrichGroupActivity, isGroupActivityEnded } = require('../utils/groupTourHelper');

function parseLevelPrices(item) {
  if (!item.level_prices) return null;
  try {
    return typeof item.level_prices === 'string' ? JSON.parse(item.level_prices) : item.level_prices;
  } catch (_) {
    return null;
  }
}

function normalizeRegularItem(item) {
  const online = Number(item.status) === 1;
  const levelPrices = parseLevelPrices(item);
  return {
    ...item,
    category: 'regular',
    service_type: Number(item.card_type) === 2 ? 'card' : 'single',
    card_type_text: Number(item.card_type) === 2 ? '多次卡' : '单次服务',
    level_prices: levelPrices || [
      { level: 1, level_name: '铜牌', price: item.base_price || 0 },
      { level: 2, level_name: '银牌', price: item.base_price || 0 },
      { level: 3, level_name: '金牌', price: item.base_price || 0 }
    ],
    statusKey: online ? 'online' : 'offline',
    statusText: online ? '上架' : '下架',
    viewOnly: false,
    order_count: Number(item.order_count || 0)
  };
}

function normalizeCustomItem(item) {
  const completed = Number(item.status) === 4;
  return {
    id: item.id,
    category: 'custom',
    name: item.name || '指定服务',
    type_name: item.type_name || '指定服务',
    description: item.custom_requirements || item.description || '',
    duration: item.duration || 60,
    base_price: item.total_price || item.base_price || 0,
    provider_name: item.provider_name || '待指派',
    user_name: item.user_name || '',
    order_no: item.order_no,
    scheduled_date: item.scheduled_date,
    scheduled_time: item.scheduled_time,
    statusKey: completed ? 'completed' : 'ongoing',
    statusText: completed ? '已完成' : '进行中',
    viewOnly: true,
    order_count: 1
  };
}

function normalizeGroupItem(item, enriched) {
  const completed = isGroupActivityEnded(item);
  return {
    id: item.id,
    category: 'group',
    name: item.name,
    type_name: '组团游',
    description: item.description || '',
    duration: 0,
    base_price: parseFloat(item.discount_value) || 0,
    provider_name: enriched.provider_display || enriched.provider_name || '暂无服务人员',
    location: item.location || '',
    current_people: Number(item.current_people || 0),
    max_people: item.total_count || 100,
    group_success: !!item.group_success,
    statusKey: completed ? 'completed' : 'ongoing',
    statusText: completed ? '已完成' : '进行中',
    viewOnly: true,
    order_count: Number(item.current_people || 0)
  };
}

class AdminServiceController {
  static async getServices(req, res) {
    try {
      await cleanupOrphanServices();
      const {
        category = 'regular',
        type_id,
        status,
        keyword
      } = req.query;

      if (category === 'custom') {
        return AdminServiceController.getCustomServices(req, res);
      }
      if (category === 'group') {
        return AdminServiceController.getGroupServices(req, res);
      }
      return AdminServiceController.getRegularServices(req, res);
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getRegularServices(req, res) {
    const { type_id, status, keyword } = req.query;
    let sql = `
      SELECT s.*, st.name AS type_name, p.nickname AS provider_name,
        (SELECT COUNT(*) FROM orders o WHERE o.service_id = s.id AND o.status NOT IN (5, 7)) AS order_count
      FROM services s
      LEFT JOIN service_types st ON s.type_id = st.id
      LEFT JOIN service_providers p ON s.provider_id = p.id
      WHERE s.provider_id IS NOT NULL
        AND s.name NOT LIKE '【定制】%'
        AND s.name NOT LIKE '【组团】%'
    `;
    const params = [];

    if (type_id) {
      sql += ' AND s.type_id = ?';
      params.push(type_id);
    }
    if (status !== undefined && status !== '') {
      sql += ' AND s.status = ?';
      params.push(parseInt(status, 10));
    }
    if (keyword) {
      sql += ' AND (s.name LIKE ? OR s.description LIKE ? OR p.nickname LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    sql += ' ORDER BY s.created_at DESC';
    const services = await db.query(sql, params);
    res.json({ code: 0, data: services.map(normalizeRegularItem) });
  }

  static async getCustomServices(req, res) {
    const { type_id, status, keyword } = req.query;
    let sql = `
      SELECT o.id, o.order_no, o.status, o.total_price, o.scheduled_date, o.scheduled_time,
             o.custom_requirements, s.name, s.description, s.duration, s.type_id,
             st.name AS type_name, u.nickname AS user_name, u.phone AS user_phone,
             sp.nickname AS provider_name
      FROM orders o
      LEFT JOIN services s ON o.service_id = s.id
      LEFT JOIN service_types st ON s.type_id = st.id
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN service_providers sp ON o.provider_id = sp.id
      WHERE o.is_custom = 1
    `;
    const params = [];

    if (type_id) {
      sql += ' AND s.type_id = ?';
      params.push(type_id);
    }
    if (status === 'completed') {
      sql += ' AND o.status = 4';
    } else if (status === 'ongoing') {
      sql += ' AND o.status != 4';
    }
    if (keyword) {
      sql += ' AND (s.name LIKE ? OR u.nickname LIKE ? OR o.order_no LIKE ? OR sp.nickname LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    sql += ' ORDER BY o.created_at DESC';
    const rows = await db.query(sql, params);
    res.json({ code: 0, data: rows.map(normalizeCustomItem) });
  }

  static async getGroupServices(req, res) {
    const { syncAllEndedGroupActivities } = require('../utils/groupTourHelper');
    await syncAllEndedGroupActivities();
    const { status, keyword } = req.query;
    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM orders o WHERE o.group_activity_id = c.id AND o.status NOT IN (5, 7)) AS current_people
      FROM coupons c
      WHERE c.type = 3
    `;
    const params = [];

    if (keyword) {
      sql += ' AND (c.name LIKE ? OR c.description LIKE ? OR c.location LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    sql += ' ORDER BY c.created_at DESC';
    const rows = await db.query(sql, params);

    const data = [];
    for (const row of rows) {
      const enriched = await enrichGroupActivity(row);
      const item = normalizeGroupItem(row, enriched);
      if (status === 'completed' && item.statusKey !== 'completed') continue;
      if (status === 'ongoing' && item.statusKey !== 'ongoing') continue;
      data.push(item);
    }
    res.json({ code: 0, data });
  }

  static async getService(req, res) {
    try {
      const { id } = req.params;
      const { category = 'regular' } = req.query;

      if (category === 'custom') {
        return AdminServiceController.getCustomServiceDetail(req, res);
      }
      if (category === 'group') {
        return AdminServiceController.getGroupServiceDetail(req, res);
      }

      const sql = `
        SELECT s.*, st.name AS type_name, p.nickname AS provider_name
        FROM services s
        LEFT JOIN service_types st ON s.type_id = st.id
        LEFT JOIN service_providers p ON s.provider_id = p.id
        WHERE s.id = ?
          AND s.provider_id IS NOT NULL
          AND s.name NOT LIKE '【定制】%'
          AND s.name NOT LIKE '【组团】%'
      `;
      const services = await db.query(sql, [id]);
      if (!services.length) {
        return res.json({ code: -1, message: '服务不存在' });
      }
      const detail = formatServiceDetail(services[0]);
      const online = Number(detail.status) === 1;
      res.json({
        code: 0,
        data: {
          ...detail,
          category: 'regular',
          statusKey: online ? 'online' : 'offline',
          statusText: online ? '上架' : '下架',
          viewOnly: false
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getCustomServiceDetail(req, res) {
    const { id } = req.params;
    const rows = await db.query(
      `SELECT o.*, s.name AS service_name, s.description AS service_description, s.duration,
              st.name AS type_name, u.nickname AS user_name, u.phone AS user_phone, u.avatar_url AS user_avatar,
              sp.nickname AS provider_name, sp.phone AS provider_phone, sp.avatar_url AS provider_avatar
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN service_types st ON s.type_id = st.id
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN service_providers sp ON o.provider_id = sp.id
       WHERE o.id = ? AND o.is_custom = 1`,
      [id]
    );
    if (!rows.length) {
      return res.json({ code: -1, message: '指派服务不存在' });
    }
    const order = rows[0];
    const reviews = await Review.getByOrderId(order.id);
    const userReview = reviews.find((r) => r.reviewer_type === 'user') || null;
    const providerReview = reviews.find((r) => r.reviewer_type === 'provider') || null;
    const completed = Number(order.status) === 4;

    res.json({
      code: 0,
      data: {
        id: order.id,
        category: 'custom',
        viewOnly: true,
        name: order.service_name || '指定服务',
        type_name: order.type_name || '指定服务',
        description: order.custom_requirements || order.service_description || '',
        duration: order.duration || 60,
        base_price: order.total_price,
        order_no: order.order_no,
        scheduled_date: order.scheduled_date,
        scheduled_time: order.scheduled_time,
        statusKey: completed ? 'completed' : 'ongoing',
        statusText: completed ? '已完成' : '进行中',
        user: {
          id: order.user_id,
          name: order.user_name,
          phone: order.user_phone,
          avatar_url: order.user_avatar
        },
        provider: {
          id: order.provider_id,
          name: order.provider_name || '待指派',
          phone: order.provider_phone,
          avatar_url: order.provider_avatar
        },
        reviews: {
          user: userReview,
          provider: providerReview
        }
      }
    });
  }

  static async getGroupServiceDetail(req, res) {
    const { id } = req.params;
    const rows = await db.query('SELECT * FROM coupons WHERE id = ? AND type = 3', [id]);
    if (!rows.length) {
      return res.json({ code: -1, message: '组团游不存在' });
    }
    const activity = rows[0];
    const enriched = await enrichGroupActivity(activity);
    const participants = await db.query(
      `SELECT o.id AS order_id, o.order_no, o.status, o.total_price,
              u.id AS user_id, u.nickname AS user_name, u.phone AS user_phone,
              sp.id AS provider_id, sp.nickname AS provider_name, sp.phone AS provider_phone
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN service_providers sp ON o.provider_id = sp.id
       WHERE o.group_activity_id = ? AND o.status NOT IN (5, 7)
       ORDER BY o.created_at ASC`,
      [id]
    );

    const reviewRows = [];
    for (const p of participants) {
      const reviews = await Review.getByOrderId(p.order_id);
      reviewRows.push({
        order_id: p.order_id,
        order_no: p.order_no,
        user_name: p.user_name,
        userReview: reviews.find((r) => r.reviewer_type === 'user') || null,
        providerReview: reviews.find((r) => r.reviewer_type === 'provider') || null
      });
    }

    const expired = activity.valid_end && new Date(activity.valid_end) < new Date();
    const completed = !!activity.group_success || expired;

    res.json({
      code: 0,
      data: {
        id: activity.id,
        category: 'group',
        viewOnly: true,
        name: activity.name,
        type_name: '组团游',
        description: activity.description || '',
        location: activity.location || '',
        base_price: parseFloat(activity.discount_value) || 0,
        min_people: parseInt(activity.min_amount, 10) || 0,
        max_people: activity.total_count || 100,
        current_people: participants.length,
        group_success: !!activity.group_success,
        valid_start: activity.valid_start,
        valid_end: activity.valid_end,
        statusKey: completed ? 'completed' : 'ongoing',
        statusText: completed ? '已完成' : '进行中',
        provider: {
          id: enriched.provider_id,
          name: enriched.provider_display || enriched.provider_name || '暂无服务人员'
        },
        participants: participants.map((p) => ({
          order_id: p.order_id,
          order_no: p.order_no,
          user_id: p.user_id,
          user_name: p.user_name,
          user_phone: p.user_phone,
          provider_name: p.provider_name,
          status: p.status
        })),
        reviewGroups: reviewRows
      }
    });
  }

  static async createService(req, res) {
    res.json({ code: -1, message: '管理端不可添加服务，请由服务人员在服务人员端发布' });
  }

  static async updateService(req, res) {
    try {
      const { id } = req.params;
      const existing = await db.query('SELECT id, name FROM services WHERE id = ?', [id]);
      if (!existing.length) {
        return res.json({ code: -1, message: '服务不存在' });
      }
      if (String(existing[0].name || '').startsWith('【定制】') || String(existing[0].name || '').startsWith('【组团】')) {
        return res.json({ code: -1, message: '该类型服务不可编辑' });
      }

      const { name, description, duration, base_price, type_id, level_requirement, cover_image, images, features, weekdays, time_slots, service_area, status, card_type, card_count, level_prices } = req.body;
      const updates = [];
      const params = [];

      if (name) { updates.push('name = ?'); params.push(name); }
      if (description) { updates.push('description = ?'); params.push(description); }
      if (duration) { updates.push('duration = ?'); params.push(duration); }
      if (base_price) { updates.push('base_price = ?'); params.push(base_price); }
      if (type_id) { updates.push('type_id = ?'); params.push(type_id); }
      if (level_requirement !== undefined) { updates.push('level_requirement = ?'); params.push(level_requirement); }
      if (cover_image) { updates.push('cover_image = ?'); params.push(cover_image); }
      if (images) { updates.push('images = ?'); params.push(images); }
      if (features) { updates.push('features = ?'); params.push(features); }
      if (weekdays) { updates.push('weekdays = ?'); params.push(weekdays); }
      if (time_slots) { updates.push('time_slots = ?'); params.push(time_slots); }
      if (service_area) { updates.push('service_area = ?'); params.push(service_area); }
      if (card_type !== undefined) { updates.push('card_type = ?'); params.push(parseInt(card_type, 10) === 2 ? 2 : 1); }
      if (card_count !== undefined) { updates.push('card_count = ?'); params.push(parseInt(card_count, 10) || 1); }
      if (level_prices) {
        updates.push('level_prices = ?');
        params.push(JSON.stringify(level_prices));
        if (Array.isArray(level_prices) && level_prices[0]?.price != null) {
          updates.push('base_price = ?');
          params.push(parseFloat(level_prices[0].price));
        }
      }
      if (status !== undefined) { updates.push('status = ?'); params.push(status); }

      if (updates.length === 0) {
        return res.json({ code: -1, message: '没有更新内容' });
      }

      params.push(id);
      await db.execute(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`, params);
      res.json({ code: 0, message: '更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async deleteService(req, res) {
    try {
      const { id } = req.params;
      const existing = await db.query('SELECT name FROM services WHERE id = ?', [id]);
      if (existing.length && (String(existing[0].name).startsWith('【定制】') || String(existing[0].name).startsWith('【组团】'))) {
        return res.json({ code: -1, message: '该类型服务不可删除' });
      }
      await db.execute('DELETE FROM services WHERE id = ?', [id]);
      res.json({ code: 0, message: '删除成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateServiceStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const existing = await db.query('SELECT name FROM services WHERE id = ?', [id]);
      if (!existing.length) {
        return res.json({ code: -1, message: '服务不存在' });
      }
      if (String(existing[0].name).startsWith('【定制】') || String(existing[0].name).startsWith('【组团】')) {
        return res.json({ code: -1, message: '该类型服务不可上下架' });
      }
      await db.execute('UPDATE services SET status = ? WHERE id = ?', [status, id]);
      res.json({ code: 0, message: '状态已更新' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getServiceTypes(req, res) {
    try {
      const types = await db.query(`
        SELECT st.*, COUNT(s.id) as service_count 
        FROM service_types st 
        LEFT JOIN services s ON st.id = s.type_id AND s.status = 1 
          AND s.provider_id IS NOT NULL
          AND s.name NOT LIKE '【定制】%' AND s.name NOT LIKE '【组团】%'
        GROUP BY st.id 
        ORDER BY st.sort_order
      `);
      res.json({ code: 0, data: types });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getAllServiceTypes(req, res) {
    try {
      const types = await db.query('SELECT id, name, status FROM service_types ORDER BY sort_order');
      res.json({ code: 0, data: types });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getServiceType(req, res) {
    try {
      const { id } = req.params;
      const types = await db.query('SELECT * FROM service_types WHERE id = ?', [id]);
      if (types.length > 0) {
        res.json({ code: 0, data: types[0] });
      } else {
        res.json({ code: -1, message: '服务类型不存在' });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async createServiceType(req, res) {
    try {
      const { name, icon, description, sort_order = 0 } = req.body;
      const result = await db.execute(
        'INSERT INTO service_types (name, icon, description, sort_order, status) VALUES (?, ?, ?, ?, 1)',
        [name, icon, description, sort_order]
      );
      res.json({ code: 0, data: { id: result.insertId }, message: '创建成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateServiceType(req, res) {
    try {
      const { id } = req.params;
      const { name, icon, description, sort_order, status, level_price_ranges } = req.body;
      const updates = [];
      const params = [];

      if (name) { updates.push('name = ?'); params.push(name); }
      if (icon) { updates.push('icon = ?'); params.push(icon); }
      if (description) { updates.push('description = ?'); params.push(description); }
      if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
      if (status !== undefined) { updates.push('status = ?'); params.push(status); }
      if (level_price_ranges !== undefined) {
        updates.push('level_price_ranges = ?');
        params.push(typeof level_price_ranges === 'string'
          ? level_price_ranges
          : JSON.stringify(level_price_ranges));
      }

      if (updates.length === 0) {
        return res.json({ code: -1, message: '没有更新内容' });
      }

      params.push(id);
      await db.execute(`UPDATE service_types SET ${updates.join(', ')} WHERE id = ?`, params);
      res.json({ code: 0, message: '更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateServiceTypeStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      await db.execute('UPDATE service_types SET status = ? WHERE id = ?', [status, id]);
      res.json({ code: 0, message: '状态已更新' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = AdminServiceController;
