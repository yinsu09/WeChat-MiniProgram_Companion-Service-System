const jwt = require('jsonwebtoken');
const config = require('../config/server');
const db = require('../utils/db');
const { recalculateAllProviderLevels } = require('../utils/providerLevel');
const { revenueSumSql } = require('../utils/revenueHelper');

const admins = [
  { id: 1, username: 'admin', password: 'admin123', nickname: '管理员', role: 3 }
];

class AdminController {
  static async login(req, res) {
    try {
      const { username, password } = req.body;

      const admin = admins.find(a => a.username === username && a.password === password);

      if (!admin) {
        return res.json({ code: -1, message: '用户名或密码错误' });
      }

      const token = jwt.sign({ userId: admin.id, role: 3 }, config.jwtSecret, { expiresIn: '7d' });
      res.json({ code: 0, data: { token, user: admin } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getStats(req, res) {
    try {
      const userResult = await db.query('SELECT COUNT(*) as count FROM users WHERE role = 1');
      const totalUsers = userResult[0].count;

      const providerResult = await db.query('SELECT COUNT(*) as count FROM users WHERE role = 2');
      const totalProviders = providerResult[0].count;

      const orderResult = await db.query('SELECT COUNT(*) as count FROM orders');
      const totalOrders = orderResult[0].count;

      const revenueResult = await db.query(`SELECT ${revenueSumSql('o')} as total FROM orders o`);
      const totalRevenue = parseFloat(revenueResult[0].total) || 0;

      const today = new Date().toISOString().split('T')[0];
      const todayOrderResult = await db.query('SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = ?', [today]);
      const todayOrders = todayOrderResult[0].count;

      const reviewResult = await db.query(`
        SELECT COUNT(*) as count
        FROM orders o
        LEFT JOIN reviews r ON o.id = r.order_id
        WHERE o.status = 4 AND r.id IS NULL
      `);
      const pendingReviews = reviewResult[0].count;

      res.json({
        code: 0,
        data: {
          totalUsers,
          totalProviders,
          totalOrders,
          totalRevenue: totalRevenue.toFixed(2),
          todayOrders,
          pendingReviews
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getProviderLevelRules(req, res) {
    try {
      const result = await db.query('SELECT config_value FROM system_configs WHERE config_key = ?', ['provider_level_rules']);

      if (result.length > 0) {
        res.json({ code: 0, data: JSON.parse(result[0].config_value) });
      } else {
        const defaultRules = {
          service_count: { bronze: 0, silver: 50, gold: 100 },
          rating: { bronze: 3.0, silver: 4.0, gold: 4.5 },
          demote: { bad_review_count: 5, min_rating: 3.5 }
        };
        res.json({ code: 0, data: defaultRules });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateProviderLevelRules(req, res) {
    try {
      const rules = req.body;
      const result = await db.execute(
        'UPDATE system_configs SET config_value = ? WHERE config_key = ?',
        [JSON.stringify(rules), 'provider_level_rules']
      );

      if (result.affectedRows > 0) {
        await recalculateAllProviderLevels();
        res.json({ code: 0, message: '保存成功' });
      } else {
        await db.execute(
          'INSERT INTO system_configs (config_key, config_value, description) VALUES (?, ?, ?)',
          ['provider_level_rules', JSON.stringify(rules), '服务人员分级规则配置']
        );
        await recalculateAllProviderLevels();
        res.json({ code: 0, message: '保存成功' });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getAssignRules(req, res) {
    try {
      const result = await db.query('SELECT config_value FROM system_configs WHERE config_key = ?', ['assign_rules']);

      if (result.length > 0) {
        res.json({ code: 0, data: JSON.parse(result[0].config_value) });
      } else {
        const defaultRules = {
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
        res.json({ code: 0, data: defaultRules });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateAssignRules(req, res) {
    try {
      const rules = req.body;
      const result = await db.execute(
        'UPDATE system_configs SET config_value = ? WHERE config_key = ?',
        [JSON.stringify(rules), 'assign_rules']
      );

      if (result.affectedRows > 0) {
        res.json({ code: 0, message: '保存成功' });
      } else {
        await db.execute(
          'INSERT INTO system_configs (config_key, config_value, description) VALUES (?, ?, ?)',
          ['assign_rules', JSON.stringify(rules), '指派规则配置']
        );
        res.json({ code: 0, message: '保存成功' });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = AdminController;