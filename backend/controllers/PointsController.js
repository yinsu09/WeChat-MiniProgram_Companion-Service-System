const db = require('../utils/db');
const { getUserPointsSummary } = require('../utils/pointsHelper');

class PointsController {
  static async getUserPoints(req, res) {
    try {
      const userId = req.userId || req.query.user_id;
      if (!userId) {
        return res.json({ code: -1, message: '缺少用户ID' });
      }

      const summary = await getUserPointsSummary(userId);
      const memberLevel = PointsController.getMemberLevel(summary.points);
      const nextLevel = PointsController.getNextLevel(summary.points);

      res.json({
        code: 0,
        data: {
          points: summary.points,
          memberLevel: memberLevel.name,
          nextLevelPoints: Math.max(nextLevel.points - summary.points, 0),
          totalConsumed: summary.totalConsumed,
          earnedPoints: summary.earnedPoints,
          usedPoints: summary.usedPoints,
          recentRecords: summary.recentRecords
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getPointsRecords(req, res) {
    try {
      const userId = req.userId;
      const { page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

      const records = await db.query(
        `SELECT id, type_name, points, created_at, order_id
         FROM points_records
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, parseInt(limit, 10), offset]
      );

      res.json({ code: 0, data: records });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async exchangeItem(req, res) {
    req.body.coupon_id = req.body.coupon_id || req.body.item_id;
    return PointsController.exchangeCoupon(req, res);
  }

  static formatCouponDisplay(c, statusLabel) {
    const value = c.discount_value ?? c.value ?? 0;
    const minAmount = c.min_amount || 0;
    const typeName = c.type_name || (Number(c.coupon_type) === 2 ? '折扣券' : '满减券');
    let expireText = '';
    if (c.expire_time) {
      const d = new Date(c.expire_time);
      expireText = Number.isNaN(d.getTime())
        ? String(c.expire_time).slice(0, 10)
        : d.toISOString().slice(0, 10);
    }
    if (typeName === '积分券') {
      return {
        id: c.id,
        name: c.name || '积分券',
        type_name: typeName,
        value,
        min_amount: 0,
        expire_time: expireText,
        desc: `兑换可获得${parseInt(value, 10) || 0}积分`,
        status: statusLabel,
        is_points_coupon: true
      };
    }
    return {
      id: c.id,
      name: c.name || '优惠券',
      type_name: typeName,
      value,
      min_amount: minAmount,
      expire_time: expireText,
      desc: typeName === '折扣券' ? `${value}折优惠` : `满${minAmount}元减${value}元`,
      status: statusLabel,
      is_points_coupon: false
    };
  }

  static isCouponExpired(expireTime, now = new Date()) {
    if (!expireTime) return false;
    const end = new Date(expireTime);
    if (Number.isNaN(end.getTime())) return false;
    end.setHours(23, 59, 59, 999);
    return end <= now;
  }

  static async getCoupons(req, res) {
    try {
      const userId = req.userId || req.query.user_id;
      if (!userId) {
        return res.json({ code: -1, message: '缺少用户ID' });
      }

      const userPointsSummary = await getUserPointsSummary(userId);
      const userPoints = userPointsSummary.points;

      const coupons = await db.query(
        `SELECT uc.id, uc.name, uc.type_name, uc.value, uc.min_amount, uc.expire_time, uc.status, uc.created_at,
                c.type AS coupon_type, c.discount_value
         FROM user_coupons uc
         LEFT JOIN coupons c ON uc.coupon_id = c.id
         WHERE uc.user_id = ? AND (uc.type_name IS NULL OR uc.type_name != '组团游')
           AND (c.id IS NULL OR c.type IS NULL OR c.type IN (0, 1, 2))
         ORDER BY uc.status ASC, uc.expire_time DESC`,
        [userId]
      );

      const now = new Date();
      const available = coupons.filter((c) => c.status === 1 && !PointsController.isCouponExpired(c.expire_time, now));
      const used = coupons.filter((c) => c.status === 2);
      const expired = coupons.filter((c) => c.status === 1 && PointsController.isCouponExpired(c.expire_time, now));

      const exchangeRows = await db.query(
        `SELECT id, name, description, type, discount_value, min_amount, valid_start, valid_end,
                total_count, used_count, points_cost, status
         FROM coupons
         WHERE (type = 0 OR type IS NULL) AND status = 1 AND points_cost > 0
           AND valid_start <= NOW() AND valid_end >= NOW()
         ORDER BY points_cost ASC`
      );

      const exchangeCoupons = exchangeRows.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        points: item.points_cost,
        value: item.discount_value,
        min_amount: item.min_amount,
        type: item.type,
        canExchange: userPoints >= item.points_cost
      }));

      res.json({
        code: 0,
        data: {
          availableCoupons: available.map((c) => PointsController.formatCouponDisplay(c, 'available')),
          usedCoupons: used.map((c) => PointsController.formatCouponDisplay(c, 'used')),
          expiredCoupons: expired.map((c) => PointsController.formatCouponDisplay(c, 'expired')),
          exchangeCoupons,
          userPoints
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async exchangeCoupon(req, res) {
    try {
      const userId = req.userId;
      const { coupon_id } = req.body;
      if (!coupon_id) {
        return res.json({ code: -1, message: '缺少优惠券ID' });
      }

      const couponRows = await db.query(
        `SELECT * FROM coupons
         WHERE id = ? AND (type = 0 OR type IS NULL) AND status = 1 AND points_cost > 0`,
        [coupon_id]
      );
      if (!couponRows.length) {
        return res.json({ code: -1, message: '该优惠券不可兑换' });
      }
      const coupon = couponRows[0];
      if (new Date(coupon.valid_end) < new Date()) {
        return res.json({ code: -1, message: '优惠券已过期' });
      }

      const userPointsSummary = await getUserPointsSummary(userId);
      const userPoints = userPointsSummary.points;
      if (userPoints < coupon.points_cost) {
        return res.json({ code: -1, message: '积分不足' });
      }

      const owned = await db.query(
        'SELECT COUNT(*) AS count FROM user_coupons WHERE user_id = ? AND coupon_id = ? AND status = 1',
        [userId, coupon.id]
      );
      if ((owned[0]?.count || 0) >= (coupon.user_limit || 1)) {
        return res.json({ code: -1, message: '已达到兑换上限' });
      }

      if ((coupon.used_count || 0) >= (coupon.total_count || 0)) {
        return res.json({ code: -1, message: '优惠券已兑完' });
      }

      await db.execute('UPDATE users SET points = points - ? WHERE id = ?', [coupon.points_cost, userId]);
      await db.execute(
        'INSERT INTO points_records (user_id, type_name, points, created_at) VALUES (?, ?, ?, NOW())',
        [userId, `积分兑换: ${coupon.name}`, -coupon.points_cost]
      );
      await db.execute(
        `INSERT INTO user_coupons (user_id, coupon_id, name, type_name, value, min_amount, expire_time, status, is_new, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, NOW())`,
        [
          userId,
          coupon.id,
          coupon.name,
          Number(coupon.type) === 2 ? '折扣券' : '满减券',
          coupon.discount_value,
          coupon.min_amount,
          coupon.valid_end
        ]
      );
      await db.execute('UPDATE coupons SET used_count = IFNULL(used_count, 0) + 1 WHERE id = ?', [coupon.id]);

      res.json({ code: 0, message: '兑换成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async markCouponsRead(req, res) {
    try {
      await db.execute('UPDATE user_coupons SET is_new = 0 WHERE user_id = ? AND is_new = 1', [req.userId]);
      res.json({ code: 0, message: '已标记为已读' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async redeemPointsCoupon(req, res) {
    try {
      const userId = req.userId;
      const couponId = req.body.id || req.body.user_coupon_id;
      if (!couponId) {
        return res.json({ code: -1, message: '缺少积分券ID' });
      }

      const rows = await db.query(
        'SELECT * FROM user_coupons WHERE id = ? AND user_id = ? AND status = 1',
        [couponId, userId]
      );
      if (!rows.length) {
        return res.json({ code: -1, message: '积分券不存在或已使用' });
      }

      const coupon = rows[0];
      if (coupon.type_name !== '积分券') {
        return res.json({ code: -1, message: '该券不是积分券' });
      }
      if (PointsController.isCouponExpired(coupon.expire_time)) {
        return res.json({ code: -1, message: '积分券已过期' });
      }

      const points = parseInt(coupon.value, 10) || 0;
      if (points <= 0) {
        return res.json({ code: -1, message: '积分券无效' });
      }

      await db.execute('UPDATE users SET points = IFNULL(points, 0) + ? WHERE id = ?', [points, userId]);
      await db.execute(
        'INSERT INTO points_records (user_id, type_name, points, created_at) VALUES (?, ?, ?, NOW())',
        [userId, `积分券兑换: ${coupon.name || '积分券'}`, points]
      );
      await db.execute('UPDATE user_coupons SET status = 2 WHERE id = ?', [couponId]);

      res.json({
        code: 0,
        message: `兑换成功，获得${points}积分`,
        data: { points }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getPointsMall(req, res) {
    try {
      const userId = req.userId;
      const userPointsSummary = await getUserPointsSummary(userId);
      const userPoints = userPointsSummary.points;

      const exchangeRows = await db.query(
        `SELECT id, name, description, type, discount_value, min_amount, valid_end, points_cost
         FROM coupons
         WHERE (type = 0 OR type IS NULL) AND status = 1 AND points_cost > 0
           AND valid_start <= NOW() AND valid_end >= NOW()
         ORDER BY points_cost ASC`
      );

      const items = exchangeRows.map((item) => ({
        id: item.id,
        name: item.name,
        desc: item.description || (Number(item.type) === 2 ? '折扣券' : '满减券'),
        icon: Number(item.type) === 2 ? '🎟️' : '🎫',
        category: 'coupon',
        points: item.points_cost,
        value: item.discount_value,
        min_amount: item.min_amount,
        canExchange: userPoints >= item.points_cost
      }));

      res.json({
        code: 0,
        data: {
          userPoints,
          items
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static getMemberLevel(points) {
    if (points >= 10000) return { name: '黑金会员', level: 5 };
    if (points >= 5000) return { name: '金卡会员', level: 4 };
    if (points >= 2000) return { name: '银卡会员', level: 3 };
    if (points >= 500) return { name: '铜卡会员', level: 2 };
    return { name: '普通会员', level: 1 };
  }

  static getNextLevel(points) {
    if (points >= 10000) return { name: '黑金会员', points: points };
    if (points >= 5000) return { name: '黑金会员', points: 10000 };
    if (points >= 2000) return { name: '金卡会员', points: 5000 };
    if (points >= 500) return { name: '银卡会员', points: 2000 };
    return { name: '铜卡会员', points: 500 };
  }

  static getExchangeItems() {
    return [
      { id: 1, name: '10元满减券', desc: '满50元可用', icon: '🎫', category: 'coupon', points: 500, value: 10, minAmount: 50 },
      { id: 2, name: '20元满减券', desc: '满100元可用', icon: '🎫', category: 'coupon', points: 1000, value: 20, minAmount: 100 },
      { id: 3, name: '50元满减券', desc: '满200元可用', icon: '🎫', category: 'coupon', points: 2000, value: 50, minAmount: 200 },
      { id: 4, name: '8折服务券', desc: '限指定服务使用', icon: '🎟️', category: 'discount', points: 3000 },
      { id: 5, name: '9折服务券', desc: '全品类通用', icon: '🎟️', category: 'discount', points: 1500 },
      { id: 6, name: '银卡会员', desc: '有效期30天', icon: '💳', category: 'vip', points: 5000 },
      { id: 7, name: '金卡会员', desc: '有效期30天', icon: '💳', category: 'vip', points: 10000 },
      { id: 8, name: '5元无门槛券', desc: '无使用限制', icon: '🎫', category: 'coupon', points: 300, value: 5, minAmount: 0 }
    ];
  }

  static getExchangeCoupons() {
    return [
      { id: 1, name: '10元满减券', points: 500, canExchange: true },
      { id: 2, name: '20元满减券', points: 1000, canExchange: true },
      { id: 3, name: '50元折扣券', points: 2000, canExchange: false },
      { id: 4, name: '8折服务券', points: 3000, canExchange: false }
    ];
  }

  static getMockPointsData() {
    return {
      points: 1280,
      memberLevel: '银卡会员',
      nextLevelPoints: 720,
      totalConsumed: 2000,
      earnedPoints: 2000,
      usedPoints: 720,
      recentRecords: this.getMockRecords()
    };
  }

  static getMockRecords() {
    return [
      { id: 1, type_name: '订单消费', points: -128, created_at: '2024-01-15 14:30' },
      { id: 2, type_name: '积分兑换', points: -200, created_at: '2024-01-10 09:15' },
      { id: 3, type_name: '服务评价奖励', points: 10, created_at: '2024-01-08 16:45' },
      { id: 4, type_name: '订单消费', points: -256, created_at: '2024-01-05 11:20' },
      { id: 5, type_name: '注册奖励', points: 100, created_at: '2024-01-01 10:00' }
    ];
  }

  static getMockCouponsData() {
    return {
      availableCoupons: this.getMockAvailableCoupons(),
      usedCoupons: this.getMockUsedCoupons(),
      expiredCoupons: this.getMockExpiredCoupons(),
      exchangeCoupons: this.getExchangeCoupons()
    };
  }

  static getMockAvailableCoupons() {
    return [
      { id: 1, name: '新人专享券', value: 20, type_name: '满减券', desc: '限新用户首次使用', min_amount: 100, expire_time: '2024-02-28', status: 'available' },
      { id: 2, name: '陪诊服务券', value: 30, type_name: '满减券', desc: '限陪诊服务使用', min_amount: 150, expire_time: '2024-02-15', status: 'available' },
      { id: 3, name: 'VIP专属券', value: 50, type_name: '折扣券', desc: '限银卡及以上会员', min_amount: 200, expire_time: '2024-03-01', status: 'available' }
    ];
  }

  static getMockUsedCoupons() {
    return [
      { id: 4, name: '限时折扣券', value: 15, type_name: '满减券', desc: '春节活动优惠券', min_amount: 80, expire_time: '2024-01-10', status: 'used' },
      { id: 5, name: '老客回馈券', value: 25, type_name: '满减券', desc: '老客户专享', min_amount: 120, expire_time: '2024-01-05', status: 'used' }
    ];
  }

  static getMockExpiredCoupons() {
    return [
      { id: 6, name: '元旦特惠券', value: 10, type_name: '满减券', desc: '元旦活动优惠券', min_amount: 50, expire_time: '2024-01-01', status: 'expired' }
    ];
  }
}

module.exports = PointsController;