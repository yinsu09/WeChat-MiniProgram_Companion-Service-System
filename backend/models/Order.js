const { query, execute } = require('../utils/db');
const { calculateRefund, initOrderServices } = require('../utils/refundHelper');
const Notification = require('./Notification');
const { getProviderUserId } = require('../utils/notificationHelper');

async function notifyRefundPending(order) {
  await Notification.create({
    user_id: order.user_id,
    title: '订单已取消',
    content: `订单 ${order.order_no} 已取消，退款申请已提交（预计 ¥${order.refund_amount || 0}），请等待管理员审核。`,
    type: 2
  });

  if (order.provider_id) {
    const providerUserId = await getProviderUserId(order.provider_id);
    if (providerUserId) {
      await Notification.create({
        user_id: providerUserId,
        title: '订单已取消',
        content: `订单 ${order.order_no} 已被用户取消，请关注后续退款处理。`,
        type: 2
      });
    }
  }
}

async function notifyRefundApproved(order, amount) {
  await Notification.create({
    user_id: order.user_id,
    title: '订单已取消',
    content: amount > 0
      ? `订单 ${order.order_no} 已取消，退款成功 ¥${amount}。`
      : `订单 ${order.order_no} 已取消。`,
    type: 2
  });
}

async function notifyRefundRejected(order, reason) {
  await Notification.create({
    user_id: order.user_id,
    title: '订单已取消',
    content: `订单 ${order.order_no} 已取消，退款未通过${reason ? `：${reason}` : ''}。`,
    type: 2
  });
}

async function restoreOrderCoupon(orderId) {
  await execute(
    'UPDATE user_coupons SET status = 1, used_order_id = NULL WHERE used_order_id = ?',
    [orderId]
  );
}

class Order {
  static async create(data) {
    const {
      order_no,
      user_id,
      service_id,
      package_id,
      service_count,
      scheduled_date,
      scheduled_time,
      total_price,
      assign_type,
      custom_requirements = null,
      user_coupon_id = null,
      discount_amount = 0,
      is_custom = 0,
      group_activity_id = null,
      promotion_discount = 0,
      discount_id = null,
      initial_status = 0
    } = data;

    const result = await execute(
      `INSERT INTO orders (
        order_no, user_id, service_id, package_id, service_count,
        scheduled_date, scheduled_time, total_price, assign_type, status,
        custom_requirements, user_coupon_id, discount_amount, is_custom,
        group_activity_id, promotion_discount, discount_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order_no,
        user_id,
        service_id,
        package_id || null,
        service_count,
        scheduled_date,
        scheduled_time,
        total_price,
        assign_type,
        initial_status,
        custom_requirements,
        user_coupon_id,
        discount_amount,
        is_custom,
        group_activity_id,
        promotion_discount,
        discount_id
      ]
    );
    return result.insertId;
  }

  static async findById(id) {
    const rows = await query('SELECT * FROM orders WHERE id = ?', [id]);
    return rows[0];
  }

  static async findByOrderNo(orderNo) {
    const rows = await query('SELECT * FROM orders WHERE order_no = ?', [orderNo]);
    return rows[0];
  }

  static async findDetailedByUserId(userId, page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const rows = await query(
      `SELECT o.*, s.name AS service_name, s.description AS service_description,
              st.name AS type_name, p.nickname AS provider_name, p.phone AS provider_phone,
              p.level AS provider_level,
              EXISTS(
                SELECT 1 FROM reviews r
                WHERE r.order_id = o.id AND r.reviewer_type = 'user'
              ) AS is_reviewed
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN service_types st ON s.type_id = st.id
       LEFT JOIN service_providers p ON o.provider_id = p.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    );
    const count = await query('SELECT COUNT(*) as total FROM orders WHERE user_id = ?', [userId]);
    return { rows, total: count[0].total };
  }

  static async findDetailedById(id) {
    const rows = await query(
      `SELECT o.*, s.name AS service_name, s.description AS service_description,
              s.cover_image AS service_image, st.name AS type_name,
              p.nickname AS provider_name, p.phone AS provider_phone, p.level AS provider_level
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN service_types st ON s.type_id = st.id
       LEFT JOIN service_providers p ON o.provider_id = p.id
       WHERE o.id = ?`,
      [id]
    );
    return rows[0];
  }

  static async findByUserId(userId, page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const rows = await query(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, pageSize, offset]
    );
    const count = await query('SELECT COUNT(*) as total FROM orders WHERE user_id = ?', [userId]);
    return { rows, total: count[0].total };
  }

  static async findByProviderId(providerId, page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const rows = await query(
      'SELECT * FROM orders WHERE provider_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [providerId, pageSize, offset]
    );
    const count = await query('SELECT COUNT(*) as total FROM orders WHERE provider_id = ?', [providerId]);
    return { rows, total: count[0].total };
  }

  static async updateStatus(id, status) {
    await execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
  }

  static async updateProvider(id, providerId) {
    await execute('UPDATE orders SET provider_id = ? WHERE id = ?', [providerId, id]);
  }

  static async payOrder(id, userId) {
    const rows = await query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, userId]);
    if (!rows.length) throw new Error('订单不存在或无权限');
    const order = rows[0];
    if (Number(order.status) !== 0) throw new Error('订单状态不可支付');
    const paidAmount = parseFloat(order.total_price) || 0;
    await execute(
      'UPDATE orders SET paid_amount = ?, payment_method = ?, payment_time = NOW(), status = 1 WHERE id = ?',
      [paidAmount, 'virtual', id]
    );
  }

  static async updateSchedule(id, userId, data) {
    const rows = await query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, userId]);
    if (!rows.length) throw new Error('订单不存在或无权限');
    const order = rows[0];
    if (![1, 2].includes(Number(order.status))) {
      throw new Error('当前状态不可修改预约');
    }
    if (order.group_activity_id) {
      throw new Error('组团游订单不可修改预约');
    }
    await execute(
      'UPDATE orders SET scheduled_date = ?, scheduled_time = ?, updated_at = NOW() WHERE id = ?',
      [data.scheduled_date, data.scheduled_time, id]
    );
    return { scheduled_date: data.scheduled_date, scheduled_time: data.scheduled_time };
  }

  static async applyCancelRefund(id, userId, reason = '') {
    const rows = await query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, userId]);
    if (!rows.length) throw new Error('订单不存在或无权限');
    const order = rows[0];
    const status = Number(order.status);

    if ([5, 6, 7].includes(status)) {
      throw new Error('订单已取消');
    }
    if (![0, 1, 2, 3].includes(status)) {
      throw new Error('当前状态不可取消');
    }

    const cancelReason = reason || '用户取消订单';

    if (status === 0) {
      await execute(
        `UPDATE orders SET status = 5, cancel_reason = ?, refund_reason = NULL,
         refund_amount = 0, refund_result = 'none' WHERE id = ?`,
        [cancelReason, id]
      );
      return { refund_amount: 0, detail: '未支付订单，无需退款' };
    }

    await initOrderServices(id, order.service_count);
    let calc = { refund_amount: 0, penalty_amount: 0, service_fee: 0, detail: '按规则计算退款' };
    try {
      calc = await calculateRefund(id);
    } catch (_) {
      // 允许零退款继续提交审核
    }

    const refundAmount = Number(calc.refund_amount) || 0;
    await execute(
      `UPDATE orders SET status = 6, cancel_reason = ?, refund_reason = ?, refund_amount = ?,
       refund_result = 'pending' WHERE id = ?`,
      [cancelReason, cancelReason, refundAmount, id]
    );

    const updated = await query('SELECT * FROM orders WHERE id = ?', [id]);
    await notifyRefundPending(updated[0]);

    return calc;
  }

  static async cancelByUser(id, userId, reason = '') {
    return Order.applyCancelRefund(id, userId, reason);
  }

  static async updateStatusForProvider(orderId, status, providerId, extra = {}) {
    const rows = await query('SELECT id FROM orders WHERE id = ? AND provider_id = ?', [orderId, providerId]);
    if (!rows.length) {
      throw new Error('订单不存在或无权限');
    }
    const statusNum = parseInt(status, 10);
    if (statusNum === 5 && extra.reason) {
      await execute(
        'UPDATE orders SET status = ?, reject_reason = ? WHERE id = ?',
        [statusNum, extra.reason, orderId]
      );
      return;
    }
    if (extra.reason) {
      await execute(
        'UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?',
        [statusNum, extra.reason, orderId]
      );
      return;
    }
    await execute('UPDATE orders SET status = ? WHERE id = ?', [statusNum, orderId]);
  }

  static async findDetailedByProviderId(providerId) {
    return query(
      `SELECT o.*, s.name AS service_name, s.service_area AS address,
              u.nickname AS user_name, u.phone AS user_phone,
              EXISTS(
                SELECT 1 FROM reviews r
                WHERE r.order_id = o.id AND r.reviewer_type = 'provider'
              ) AS hasReviewed,
              EXISTS(
                SELECT 1 FROM reviews r
                WHERE r.order_id = o.id AND r.reviewer_type = 'user'
              ) AS userReviewed
       FROM orders o
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.provider_id = ?
       ORDER BY o.created_at DESC`,
      [providerId]
    );
  }

  static async updatePayment(orderNo, paidAmount, paymentMethod) {
    await execute(
      'UPDATE orders SET paid_amount = ?, payment_method = ?, payment_time = NOW(), status = 1 WHERE order_no = ?',
      [paidAmount, paymentMethod, orderNo]
    );
  }

  static async requestRefund(orderId, reason, userId) {
    return Order.applyCancelRefund(orderId, userId, reason || '用户取消订单');
  }

  static async approveRefund(orderId, refundAmount) {
    const rows = await query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!rows.length) throw new Error('订单不存在');
    const order = rows[0];
    const amount = Number(refundAmount) || Number(order.refund_amount) || 0;
    await execute(
      `UPDATE orders SET status = 7, refund_amount = ?, refund_result = 'approved' WHERE id = ?`,
      [amount, orderId]
    );
    await restoreOrderCoupon(orderId);
    await notifyRefundApproved(order, amount);
  }

  static async rejectRefund(orderId, rejectReason = '') {
    const rows = await query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!rows.length) throw new Error('订单不存在');
    const order = rows[0];
    await execute(
      `UPDATE orders SET status = 5, refund_result = 'rejected', refund_reject_reason = ? WHERE id = ?`,
      [rejectReason || '管理员拒绝退款', orderId]
    );
    await restoreOrderCoupon(orderId);
    await notifyRefundRejected(order, rejectReason || '管理员拒绝退款');
  }

  static async getAll(page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const rows = await query(
      'SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [pageSize, offset]
    );
    const count = await query('SELECT COUNT(*) as total FROM orders');
    return { rows, total: count[0].total };
  }
}

module.exports = Order;
