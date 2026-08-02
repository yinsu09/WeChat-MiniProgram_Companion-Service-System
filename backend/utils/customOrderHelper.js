const db = require('../utils/db');
const { calculateDiscount } = require('../utils/couponHelper');

class CustomOrderHelper {
  static async getCustomServiceTemplate(typeId) {
    const rows = await db.query(
      `SELECT * FROM services WHERE type_id = ? AND name LIKE '【定制】%' AND status = 1 LIMIT 1`,
      [parseInt(typeId, 10)]
    );
    if (rows.length) return rows[0];

    const types = await db.query('SELECT name FROM service_types WHERE id = ?', [typeId]);
    const typeName = types[0]?.name || '服务';
    const result = await db.execute(
      `INSERT INTO services (type_id, name, description, duration, base_price, status)
       VALUES (?, ?, ?, 60, 100, 1)`,
      [parseInt(typeId, 10), `【定制】${typeName}`, '用户指定服务人员的定制需求']
    );
    return {
      id: result.insertId,
      base_price: 100,
      duration: 60
    };
  }

  static async applyUserCoupon(userId, userCouponId, originalPrice) {
    if (!userCouponId) {
      return { discount: 0, finalPrice: originalPrice, userCouponId: null };
    }

    const rows = await db.query(
      `SELECT uc.*, c.type AS coupon_type, c.discount_value, c.min_amount, c.valid_end, c.status AS coupon_status
       FROM user_coupons uc
       LEFT JOIN coupons c ON uc.coupon_id = c.id
       WHERE uc.id = ? AND uc.user_id = ? AND uc.status = 1`,
      [userCouponId, userId]
    );
    if (!rows.length) {
      throw new Error('优惠券不可用');
    }

    const uc = rows[0];
    if (uc.type_name === '积分券') {
      throw new Error('积分券不可用于订单抵扣，请先在优惠券页兑换积分');
    }
    const expireTime = uc.expire_time || uc.valid_end;
    if (expireTime && new Date(expireTime) < new Date()) {
      throw new Error('优惠券已过期');
    }

    const couponType = uc.coupon_type ?? (uc.type_name === '折扣券' ? 2 : 0);
    const discountValue = uc.discount_value ?? uc.value;
    const minAmount = uc.min_amount ?? 0;
    const result = calculateDiscount(couponType, discountValue, originalPrice, minAmount);
    if (result.message) {
      throw new Error(result.message);
    }

    return {
      discount: result.discount,
      finalPrice: result.finalPrice,
      userCouponId
    };
  }

  static async markCouponUsed(userCouponId, orderId) {
    if (!userCouponId) return;
    await db.execute(
      'UPDATE user_coupons SET status = 2, used_order_id = ? WHERE id = ?',
      [orderId, userCouponId]
    );
  }
}

module.exports = CustomOrderHelper;
