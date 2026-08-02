const db = require('../utils/db');
const {
  getLevelName,
  getLevelColor,
  recalculateProviderLevel,
  recalculateAllProviderLevels
} = require('../utils/providerLevel');
const { normalizeIdCard, isPlaceholderIdCard } = require('../utils/idCard');
const { formatServiceTypes, syncUserToServiceProvider } = require('../utils/providerSync');
const { deleteServicesByProvider, cleanupOrphanServices } = require('../utils/serviceHelper');

function mapDisplayStatus(spStatus, available) {
  if (spStatus === 0) return 'disabled';
  if (spStatus === 2) return 'offline';
  if (available === 0) return 'busy';
  return 'idle';
}

function mapProviderRow(sp, user) {
  const level = sp.level ?? 0;
  const spStatus = sp.status ?? (user?.user_status === 0 ? 0 : 1);
  const available = sp.available ?? 1;
  const status = mapDisplayStatus(spStatus, available);
  const statusTexts = { idle: '空闲', busy: '忙碌', offline: '离线', disabled: '已禁用' };
  return {
    id: sp.id,
    nickname: user?.nickname || sp.nickname || '',
    phone: user?.phone || sp.phone || '',
    avatar_url: user?.avatar_url || sp.avatar_url || '',
    level,
    level_name: getLevelName(level),
    level_color: getLevelColor(level),
    service_count: sp.total_services || 0,
    rating: parseFloat(sp.avg_rating || 0).toFixed(1),
    service_types: user ? formatServiceTypes(user.service_types) : '',
    service_area: user?.service_area || '',
    status,
    status_text: statusTexts[status] || '离线',
    account_status: spStatus,
    disabled: spStatus === 0 || user?.user_status === 0
  };
}

async function repairProviderIdCards() {
  const rows = await db.query("SELECT id, openid, phone FROM service_providers WHERE id_card = '' OR id_card IS NULL");
  for (const row of rows) {
    const idCard = normalizeIdCard('', row.phone);
    await db.execute('UPDATE service_providers SET id_card = ? WHERE id = ?', [idCard, row.id]);
  }
}
async function syncMissingProviderRecords() {
  await repairProviderIdCards();
  await db.execute("UPDATE users SET id_card = NULL WHERE id_card = ''");

  const orphans = await db.query(`
    SELECT u.id, u.openid, u.nickname, u.avatar_url, u.phone, u.real_name, u.id_card, u.status
    FROM users u
    WHERE u.role = 2
      AND NOT EXISTS (
        SELECT 1 FROM service_providers sp
        WHERE sp.openid = u.openid OR sp.phone = u.phone
      )
    ORDER BY u.id DESC
  `);

  const syncedPhones = new Set();

  for (const user of orphans) {
    if (syncedPhones.has(user.phone)) {
      continue;
    }
    syncedPhones.add(user.phone);

    const idCard = normalizeIdCard(user.id_card, user.phone);
    if (idCard && !isPlaceholderIdCard(idCard)) {
      const dup = await db.query('SELECT id FROM service_providers WHERE id_card = ?', [idCard]);
      if (dup.length > 0) {
        continue;
      }
    }

    try {
      await db.execute(
        `INSERT INTO service_providers
          (openid, nickname, avatar_url, phone, real_name, id_card, level, total_services, avg_rating, status, available, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0.00, ?, 1, NOW(), NOW())`,
        [
          user.openid,
          user.nickname || '服务人员',
          user.avatar_url || '',
          user.phone,
          user.real_name || '',
          idCard,
          user.status === 0 ? 0 : 1
        ]
      );
    } catch (_) {
    }
  }
}

async function syncProviderStatusBetweenTables() {
  await db.execute(`
    UPDATE service_providers sp
    INNER JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
    SET sp.status = 0
    WHERE u.status = 0 AND sp.status <> 0
  `);
  await db.execute(`
    UPDATE users u
    INNER JOIN service_providers sp ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
    SET u.status = 0
    WHERE sp.status = 0 AND u.status <> 0
  `);
}

class AdminProviderController {
  static async getProviders(req, res) {
    try {
      await syncMissingProviderRecords();
      await syncProviderStatusBetweenTables();
      await recalculateAllProviderLevels();

      const { status, level, service_type, rating, count, keyword, sort_by, sort_order } = req.query;
      let sql = `
        SELECT sp.*, u.service_types as user_service_types, u.service_area, u.bio, u.gender, u.status as user_status, u.nickname as user_nickname, u.avatar_url as user_avatar_url, u.phone as user_phone
        FROM service_providers sp
        LEFT JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
        WHERE 1=1
      `;
      const params = [];

      if (status === 'idle') {
        sql += ' AND sp.status = 1 AND sp.available = 1';
      } else if (status === 'busy') {
        sql += ' AND sp.status = 1 AND sp.available = 0';
      } else if (status === 'offline') {
        sql += ' AND sp.status = 2';
      } else if (status === 'disabled') {
        sql += ' AND (sp.status = 0 OR u.status = 0)';
      }
      if (level) {
        sql += ' AND sp.level = ?';
        params.push(level);
      }
      if (service_type) {
        sql += ' AND JSON_CONTAINS(u.service_types, ?)';
        params.push(JSON.stringify(parseInt(service_type, 10)));
      }
      if (rating) {
        sql += ' AND sp.avg_rating >= ?';
        params.push(rating);
      }
      if (count) {
        const range = count.split('-');
        if (range.length === 2) {
          sql += ' AND sp.total_services >= ? AND sp.total_services <= ?';
          params.push(range[0], range[1]);
        } else {
          sql += ' AND sp.total_services >= ?';
          params.push(count);
        }
      }
      if (keyword) {
        sql += ' AND (sp.nickname LIKE ? OR sp.real_name LIKE ? OR sp.phone LIKE ? OR u.nickname LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }

      if (sort_by) {
        const sortFields = {
          rating: 'sp.avg_rating',
          service_count: 'sp.total_services',
          create_time: 'sp.created_at'
        };
        const field = sortFields[sort_by] || 'sp.created_at';
        sql += ` ORDER BY ${field} ${sort_order === 'asc' ? 'ASC' : 'DESC'}`;
      } else {
        sql += ' ORDER BY sp.created_at DESC';
      }

      const rows = await db.query(sql, params);
      const providers = rows.map(row => mapProviderRow(row, {
        service_types: row.user_service_types,
        service_area: row.service_area,
        user_status: row.user_status,
        nickname: row.user_nickname,
        avatar_url: row.user_avatar_url,
        phone: row.user_phone
      }));
      res.json({ code: 0, data: providers });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getProvider(req, res) {
    try {
      const { id } = req.params;

      const providers = await db.query('SELECT * FROM service_providers WHERE id = ?', [id]);

      if (providers.length === 0) {
        return res.json({ code: -1, message: '服务人员不存在' });
      }

      const levelInfo = await recalculateProviderLevel(id);
      const provider = (await db.query('SELECT * FROM service_providers WHERE id = ?', [id]))[0];

      const users = await db.query(
        'SELECT id, nickname, service_types, service_area, bio, gender, status as user_status FROM users WHERE role = 2 AND (openid = ? OR phone = ?)',
        [provider.openid, provider.phone]
      );
      const user = users[0] || null;

      if (user?.id) {
        await syncUserToServiceProvider(user.id);
      }

      const orders = await db.query(
        'SELECT COUNT(*) as total, SUM(CASE WHEN status = 4 THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = 5 THEN 1 ELSE 0 END) as canceled FROM orders WHERE provider_id = ?',
        [id]
      );

      const reviews = await db.query(
        `SELECT COUNT(*) AS count, AVG(overall_rating) AS avg_rating
         FROM reviews WHERE provider_id = ? AND reviewer_type = 'user'`,
        [id]
      );

      const income = await db.query(
        'SELECT COALESCE(SUM(paid_amount), 0) as total FROM orders WHERE provider_id = ? AND status = 4',
        [id]
      );

      const orderStats = orders[0] || {};
      const reviewStats = reviews[0] || {};
      const incomeStats = income[0] || {};
      const level = levelInfo.level;

      const result = {
        id: provider.id,
        openid: provider.openid,
        user_id: user?.id || null,
        nickname: user?.nickname || provider.nickname,
        phone: provider.phone,
        real_name: user?.real_name || provider.real_name,
        avatar_url: user?.avatar_url || provider.avatar_url,
        gender: user?.gender === 1 ? '男' : user?.gender === 2 ? '女' : '未知',
        service_types: user ? formatServiceTypes(user.service_types) : '',
        service_area: user?.service_area || '',
        introduction: user?.bio || '',
        level,
        level_name: levelInfo.level_name,
        level_color: levelInfo.level_color,
        status: mapDisplayStatus(provider.status, provider.available),
        status_text: { idle: '空闲', busy: '忙碌', offline: '离线', disabled: '已禁用' }[mapDisplayStatus(provider.status, provider.available)] || '离线',
        account_status: provider.status,
        disabled: provider.status === 0 || user?.user_status === 0,
        avg_rating: provider.avg_rating || reviewStats.avg_rating || 0,
        total_services: provider.total_services || orderStats.completed || 0,
        service_count: orderStats.completed || provider.total_services || 0,
        rating: parseFloat(provider.avg_rating || reviewStats.avg_rating || 0).toFixed(1),
        completed_orders: orderStats.completed || 0,
        canceled_orders: orderStats.canceled || 0,
        review_count: reviewStats.count || 0,
        total_income: parseFloat(incomeStats.total || 0).toFixed(2),
        created_at: provider.created_at,
        updated_at: provider.updated_at
      };

      res.json({ code: 0, data: result });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async createProvider(req, res) {
    try {
      const { nickname, phone, real_name, id_card } = req.body;
      const normalizedIdCard = normalizeIdCard(id_card, phone);
      const result = await db.execute(
        'INSERT INTO service_providers (openid, nickname, phone, real_name, id_card, level, status) VALUES (?, ?, ?, ?, ?, 0, 1)',
        [phone, nickname, phone, real_name, normalizedIdCard]
      );
      res.json({ code: 0, data: { id: result.insertId }, message: '创建成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateProvider(req, res) {
    return res.json({ code: -1, message: '管理员无法编辑服务人员信息' });
  }

  static async disableProvider(req, res) {
    try {
      const { id } = req.params;

      const providers = await db.query('SELECT openid, phone, status FROM service_providers WHERE id = ?', [id]);
      if (providers.length === 0) {
        return res.json({ code: -1, message: '服务人员不存在' });
      }

      const provider = providers[0];
      if (provider.status === 0) {
        return res.json({ code: -1, message: '该服务人员已被禁用' });
      }

      await db.execute('UPDATE service_providers SET status = 0 WHERE id = ?', [id]);
      await db.execute(
        'UPDATE users SET status = 0 WHERE role = 2 AND (openid = ? OR phone = ?)',
        [provider.openid, provider.phone]
      );

      res.json({ code: 0, message: '禁用成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async enableProvider(req, res) {
    try {
      const { id } = req.params;

      const providers = await db.query('SELECT openid, phone, status FROM service_providers WHERE id = ?', [id]);
      if (providers.length === 0) {
        return res.json({ code: -1, message: '服务人员不存在' });
      }

      const provider = providers[0];
      if (provider.status !== 0) {
        return res.json({ code: -1, message: '该服务人员未处于禁用状态' });
      }

      await db.execute('UPDATE service_providers SET status = 1, available = 1 WHERE id = ?', [id]);
      await db.execute(
        'UPDATE users SET status = 1 WHERE role = 2 AND (openid = ? OR phone = ?)',
        [provider.openid, provider.phone]
      );

      res.json({ code: 0, message: '启用成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async deleteProvider(req, res) {
    try {
      const { id } = req.params;

      const providers = await db.query('SELECT openid, phone FROM service_providers WHERE id = ?', [id]);
      if (providers.length === 0) {
        return res.json({ code: -1, message: '服务人员不存在' });
      }

      const { openid, phone } = providers[0];
      const users = await db.query(
        'SELECT id FROM users WHERE role = 2 AND (openid = ? OR phone = ?)',
        [openid, phone]
      );
      const userId = users[0]?.id || null;

      await deleteServicesByProvider(id, userId, phone);
      await cleanupOrphanServices();
      await db.execute('DELETE FROM provider_services WHERE provider_id = ?', [id]);
      await db.execute('DELETE FROM service_providers WHERE id = ?', [id]);
      await db.execute(
        'DELETE FROM users WHERE role = 2 AND (openid = ? OR phone = ?)',
        [openid, phone]
      );

      res.json({ code: 0, message: '删除成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getAvailableProviders(req, res) {
    try {
      const { level, keyword, service_type_id, service_id } = req.query;
      let typeId = service_type_id;

      if (!typeId && service_id) {
        const services = await db.query('SELECT type_id FROM services WHERE id = ?', [service_id]);
        typeId = services[0]?.type_id;
      }

      let sql = `
        SELECT sp.id, sp.nickname, sp.avatar_url, sp.phone, sp.level,
               sp.avg_rating AS rating, sp.total_services AS service_count,
               sp.status, sp.available, u.service_types, u.service_area
        FROM service_providers sp
        INNER JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
        WHERE sp.status = 1 AND u.status = 1
      `;
      const params = [];

      if (typeId) {
        sql += ' AND JSON_CONTAINS(u.service_types, ?)';
        params.push(JSON.stringify(parseInt(typeId, 10)));
      }
      if (level) {
        sql += ' AND sp.level = ?';
        params.push(parseInt(level, 10));
      }
      if (keyword) {
        sql += ' AND (sp.nickname LIKE ? OR sp.phone LIKE ? OR u.nickname LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }

      sql += ' ORDER BY sp.avg_rating DESC, sp.total_services DESC';

      const rows = await db.query(sql, params);
      const providers = rows.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        name: row.nickname,
        avatar_url: row.avatar_url || '',
        phone: row.phone || '',
        level: row.level || 0,
        level_name: getLevelName(row.level || 0),
        level_color: getLevelColor(row.level || 0),
        rating: parseFloat(row.rating || 0).toFixed(1),
        service_count: row.service_count || 0,
        service_area: row.service_area || '',
        service_types: formatServiceTypes(row.service_types).split(',').filter(Boolean),
        status: row.available === 1 ? 'idle' : 'busy',
        available: row.available === 1
      }));

      res.json({ code: 0, data: providers });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = AdminProviderController;
