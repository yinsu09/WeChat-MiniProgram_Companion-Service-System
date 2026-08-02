const { query, execute, withTransaction } = require('../utils/db');
const jwt = require('jsonwebtoken');
const config = require('../config/server');
const { normalizeIdCard, isPlaceholderIdCard } = require('../utils/idCard');

class User {
  static async findByOpenid(openid) {
    const rows = await query('SELECT * FROM users WHERE openid = ?', [openid]);
    return rows[0];
  }

  static async findById(id) {
    const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0];
  }

  static async findByPhone(phone) {
    const rows = await query('SELECT * FROM users WHERE phone = ?', [phone]);
    return rows[0];
  }

  static async findByPhoneAndRole(phone, role) {
    const rows = await query('SELECT * FROM users WHERE phone = ? AND role = ?', [phone, role]);
    return rows[0];
  }

  static async create(data) {
    const { openid, nickname, avatar_url, phone, password, real_name, gender, role, service_types, status } = data;
    const result = await execute(
      'INSERT INTO users (openid, nickname, avatar_url, phone, password, real_name, gender, role, service_types, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [openid, nickname, avatar_url, phone, password || '', real_name || '', gender || 0, role || 1, service_types || '', status || 1]
    );
    return result.insertId;
  }

  static async createProvider(data) {
    const { phone, password, name, avatar, id_card, service_area } = data;
    const normalizedIdCard = normalizeIdCard(id_card, phone);

    const existingProvider = await this.findByPhoneAndRole(phone, 2);
    if (existingProvider) {
      throw new Error('该手机号已注册服务人员');
    }

    if (normalizedIdCard && !isPlaceholderIdCard(normalizedIdCard)) {
      const dupCard = await query('SELECT id FROM service_providers WHERE id_card = ?', [normalizedIdCard]);
      if (dupCard.length > 0) {
        throw new Error('该身份证号已被注册');
      }
    }

    const openid = 'provider_' + Date.now();
    const displayName = name || '服务人员';

    const user = await withTransaction(async (conn) => {
      const [userResult] = await conn.query(
        'INSERT INTO users (openid, nickname, avatar_url, phone, password, real_name, id_card, role, service_area, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [openid, displayName, avatar || '', phone, password, displayName, normalizedIdCard, 2, service_area || '', 1]
      );

      await conn.query(
        'INSERT INTO service_providers (openid, nickname, avatar_url, phone, real_name, id_card, level, total_services, avg_rating, status, available, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0.00, 1, 1, NOW(), NOW())',
        [openid, displayName, avatar || '', phone, displayName, normalizedIdCard]
      );

      const [rows] = await conn.query('SELECT * FROM users WHERE id = ?', [userResult.insertId]);
      return rows[0];
    });

    const token = jwt.sign({ userId: user.id, phone }, config.jwtSecret, { expiresIn: '7d' });
    return { token, user };
  }

  static async update(id, data) {
    const fields = [];
    const params = [];
    if (data.nickname !== undefined) { fields.push('nickname = ?'); params.push(data.nickname); }
    if (data.avatar_url !== undefined) { fields.push('avatar_url = ?'); params.push(data.avatar_url); }
    if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone); }
    if (data.password !== undefined) { fields.push('password = ?'); params.push(data.password); }
    if (data.real_name !== undefined) { fields.push('real_name = ?'); params.push(data.real_name); }
    if (data.id_card !== undefined) { fields.push('id_card = ?'); params.push(data.id_card); }
    if (data.gender !== undefined) { fields.push('gender = ?'); params.push(data.gender); }
    if (data.role !== undefined) { fields.push('role = ?'); params.push(data.role); }
    if (data.service_types !== undefined) { fields.push('service_types = ?'); params.push(data.service_types); }
    if (data.weekdays !== undefined) { fields.push('weekdays = ?'); params.push(data.weekdays); }
    if (data.time_slots !== undefined) { fields.push('time_slots = ?'); params.push(data.time_slots); }
    if (data.service_area !== undefined) { fields.push('service_area = ?'); params.push(data.service_area); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.bio !== undefined) { fields.push('bio = ?'); params.push(data.bio); }
    if (params.length === 0) return;
    params.push(id);
    await execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  static async updateProvider(id, data) {
    return await this.update(id, data);
  }

  static async loginByPassword(phone, password, type = 'user') {
    const role = type === 'provider' ? 2 : 1;
    const user = await this.findByPhoneAndRole(phone, role);
    if (!user) {
      throw new Error(type === 'provider' ? '该手机号未注册服务人员' : '该手机号未注册');
    }
    if (user.password !== password) {
      throw new Error('密码错误');
    }
    if (user.status === 0) {
      if (type === 'provider' || user.role === 2) {
        throw new Error('登陆失败，该账号已被禁用');
      }
      throw new Error('账号未审核通过');
    }
    const token = jwt.sign({ userId: user.id, phone }, config.jwtSecret, { expiresIn: '7d' });
    return { token, user };
  }

  static async loginByPhone(phone, code, type = 'user') {
    if (code !== '1111') {
      throw new Error('验证码错误');
    }
    let user = await this.findByPhoneAndRole(phone, type === 'provider' ? 2 : 1);
    if (!user) {
      const userId = await this.create({
        openid: (type === 'provider' ? 'provider_phone_' : 'phone_openid_') + phone,
        nickname: (type === 'provider' ? '服务人员' : '用户') + phone.slice(-4),
        avatar_url: '',
        phone,
        role: type === 'provider' ? 2 : 1,
        status: 1
      });
      user = await this.findById(userId);
    }
    if (type === 'provider' && user.status === 0) {
      throw new Error('登陆失败，该账号已被禁用');
    }
    const token = jwt.sign({ userId: user.id, phone }, config.jwtSecret, { expiresIn: '7d' });
    return { token, user };
  }

  static async updatePoints(userId, points) {
    await execute(
      'UPDATE user_points SET points = points + ?, total_earned = total_earned + ? WHERE user_id = ?',
      [points, points, userId]
    );
  }
}

module.exports = User;
