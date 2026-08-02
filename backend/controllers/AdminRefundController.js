const db = require('../utils/db');
const Order = require('../models/Order');
const { reverseOrderPoints } = require('../utils/pointsHelper');
const { calculateRefund, getOrderServiceUsage } = require('../utils/refundHelper');

function formatRefundTime(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toLocaleString('zh-CN', { hour12: false });
  }
  return String(value).replace('T', ' ').slice(0, 19);
}

function mapRefundDisplayStatus(order) {
  const status = Number(order.status);
  const result = order.refund_result;
  if (status === 6) return 'pending';
  if (status === 7 || result === 'approved') return 'approved';
  if (status === 5 && result === 'rejected') return 'rejected';
  return 'canceled';
}

async function buildRefundDetail(order) {
  let refundCalc = null;
  if ([2, 3, 4, 5, 6, 7].includes(Number(order.status))) {
    try {
      refundCalc = await calculateRefund(order.id);
    } catch (_) {}
  }
  const usage = await getOrderServiceUsage(order.id);
  const totalPrice = Number(order.total_price) || 0;
  const refundAmount = Number(order.refund_amount) || Number(refundCalc?.refund_amount) || 0;
  const penaltyAmount = Number(refundCalc?.penalty_amount) || 0;
  const serviceFee = Number(refundCalc?.service_fee) || 0;
  const displayStatus = mapRefundDisplayStatus(order);
  const applyTime = formatRefundTime(order.updated_at || order.created_at);

  return {
    id: order.id,
    order_id: order.id,
    refund_no: order.order_no || `RF${order.id}`,
    order_no: order.order_no || '',
    user_name: order.user_name || '未知用户',
    user_phone: order.user_phone || '',
    service_name: order.service_name || '',
    service_image: order.service_image || '',
    provider_name: order.provider_name || '',
    amount: refundAmount,
    refund_amount: refundAmount,
    order_amount: totalPrice,
    total_price: totalPrice,
    reason: order.refund_reason || order.cancel_reason || '',
    cancel_reason: order.cancel_reason || '',
    apply_time: applyTime,
    created_at: formatRefundTime(order.created_at),
    status: displayStatus,
    raw_status: Number(order.status),
    refund_result: order.refund_result || null,
    refund_reject_reason: order.refund_reject_reason || '',
    reject_reason: order.refund_reject_reason || '',
    penalty_amount: penaltyAmount,
    service_fee: serviceFee,
    unused_count: refundCalc?.unused_count ?? usage.unused,
    total_count: refundCalc?.total_count ?? usage.total,
    refund_detail: refundCalc?.detail || '',
    scheduled_date: order.scheduled_date,
    scheduled_time: order.scheduled_time,
    process_time: displayStatus !== 'pending' ? applyTime : '',
    actual_amount: displayStatus === 'approved' ? refundAmount : 0,
    process_remark: ''
  };
}

class AdminRefundController {
  static async getRefunds(req, res) {
    try {
      const { status, start_date, end_date, refund_result } = req.query;
      let sql = `SELECT o.*, u.nickname as user_name, s.name as service_name 
                 FROM orders o 
                 LEFT JOIN users u ON o.user_id = u.id 
                 LEFT JOIN services s ON o.service_id = s.id 
                 WHERE 1=1`;
      const params = [];

      if (status === '5') {
        sql += " AND o.status = 5 AND (o.refund_result IS NULL OR o.refund_result = 'none')";
      } else if (status) {
        sql += ' AND o.status = ?';
        params.push(status);
      } else if (refund_result === 'rejected') {
        sql += " AND o.status = 5 AND o.refund_result = 'rejected'";
      } else {
        sql += ' AND o.status IN (5, 6, 7)';
      }
      if (start_date) {
        sql += ' AND DATE(o.created_at) >= ?';
        params.push(start_date);
      }
      if (end_date) {
        sql += ' AND DATE(o.created_at) <= ?';
        params.push(end_date);
      }

      sql += ' ORDER BY o.updated_at DESC, o.created_at DESC';

      const orders = await db.query(sql, params);
      const refunds = await Promise.all(orders.map(async (o) => {
        const detail = await buildRefundDetail(o);
        return {
          ...detail,
          status: o.status
        };
      }));
      res.json({ code: 0, data: refunds });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getRefund(req, res) {
    try {
      const { id } = req.params;
      const sql = `SELECT o.*, u.nickname as user_name, u.phone as user_phone, 
                          s.name as service_name, s.cover_image as service_image,
                          p.nickname as provider_name
                   FROM orders o 
                   LEFT JOIN users u ON o.user_id = u.id 
                   LEFT JOIN services s ON o.service_id = s.id 
                   LEFT JOIN service_providers p ON o.provider_id = p.id 
                   WHERE o.id = ?`;
      const orders = await db.query(sql, [id]);
      if (orders.length > 0) {
        const refund = await buildRefundDetail(orders[0]);
        res.json({ code: 0, data: refund });
      } else {
        res.json({ code: -1, message: '退费记录不存在' });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getRefundByOrder(req, res) {
    try {
      const { orderId } = req.params;
      const sql = `SELECT o.*, u.nickname as user_name, u.phone as user_phone, 
                          s.name as service_name, s.cover_image as service_image,
                          p.nickname as provider_name
                   FROM orders o 
                   LEFT JOIN users u ON o.user_id = u.id 
                   LEFT JOIN services s ON o.service_id = s.id 
                   LEFT JOIN service_providers p ON o.provider_id = p.id 
                   WHERE o.id = ?`;
      const orders = await db.query(sql, [orderId]);
      if (orders.length > 0) {
        const refund = await buildRefundDetail(orders[0]);
        res.json({ code: 0, data: refund });
      } else {
        res.json({ code: -1, message: '订单不存在' });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async approveRefund(req, res) {
    try {
      const { id } = req.params;
      const { actual_amount, process_remark } = req.body || {};
      const orders = await db.query('SELECT * FROM orders WHERE id = ?', [id]);
      if (!orders.length) {
        return res.json({ code: -1, message: '订单不存在' });
      }
      if (Number(orders[0].status) !== 6) {
        return res.json({ code: -1, message: '当前订单不在退款审核中' });
      }

      const refundAmount = Number(actual_amount) || Number(orders[0].refund_amount) || Number(orders[0].total_price) || 0;
      await reverseOrderPoints(id, refundAmount);
      await Order.approveRefund(id, refundAmount);
      res.json({ code: 0, message: '退款成功', data: { refund_amount: refundAmount, process_remark: process_remark || '' } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async rejectRefund(req, res) {
    try {
      const { id } = req.params;
      const { reject_reason } = req.body;
      const orders = await db.query('SELECT * FROM orders WHERE id = ?', [id]);
      if (!orders.length) {
        return res.json({ code: -1, message: '订单不存在' });
      }
      if (Number(orders[0].status) !== 6) {
        return res.json({ code: -1, message: '当前订单不在退款审核中' });
      }

      await Order.rejectRefund(id, reject_reason || '管理员拒绝退款');
      res.json({ code: 0, message: '已拒绝退款，订单保持取消状态' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getRefundStats(req, res) {
    try {
      const countResult = await db.query('SELECT COUNT(*) as count FROM orders WHERE status = 6');
      const amountResult = await db.query('SELECT IFNULL(SUM(refund_amount), 0) as total FROM orders WHERE status = 7');
      const canceledResult = await db.query(
        "SELECT COUNT(*) as count FROM orders WHERE status = 5 AND (refund_result IS NULL OR refund_result IN ('none', 'rejected'))"
      );
      const rejectedResult = await db.query(
        "SELECT COUNT(*) as count FROM orders WHERE refund_result = 'rejected'"
      );
      const refundedTotal = parseFloat(amountResult[0]?.total) || 0;
      res.json({
        code: 0,
        data: {
          pendingCount: countResult[0]?.count || 0,
          canceledCount: canceledResult[0]?.count || 0,
          rejectedCount: rejectedResult[0]?.count || 0,
          totalRefunded: refundedTotal.toFixed(2),
          canceledAmount: 0
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getRefundRules(req, res) {
    try {
      const result = await db.query('SELECT config_value FROM system_configs WHERE config_key = ?', ['refund_rules']);
      if (result.length > 0) {
        res.json({ code: 0, data: JSON.parse(result[0].config_value) });
      } else {
        const defaultRules = {
          service_fee_rate: 5,
          cancel_24h_rate: 10,
          cancel_2h_rate: 30,
          cancel_started_rate: 50,
          card_refund_rate: 10,
          min_refund_amount: 10,
          free_cancel_provider: true,
          free_cancel_platform: true,
          free_cancel_emergency: true
        };
        res.json({ code: 0, data: defaultRules });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateRefundRules(req, res) {
    try {
      const rules = req.body;
      const result = await db.execute(
        'UPDATE system_configs SET config_value = ? WHERE config_key = ?',
        [JSON.stringify(rules), 'refund_rules']
      );
      if (result.affectedRows > 0) {
        res.json({ code: 0, message: '保存成功' });
      } else {
        await db.execute(
          'INSERT INTO system_configs (config_key, config_value, description) VALUES (?, ?, ?)',
          ['refund_rules', JSON.stringify(rules), '退费规则配置']
        );
        res.json({ code: 0, message: '保存成功' });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = AdminRefundController;
