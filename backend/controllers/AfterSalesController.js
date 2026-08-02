const AfterSales = require('../models/AfterSales');
const Order = require('../models/Order');
const { calculateRefund } = require('../utils/refundHelper');
const { initOrderServices } = require('../utils/refundHelper');
const { notifyRefundPending } = require('../utils/notificationHelper');
const db = require('../utils/db');

class AfterSalesController {
  static async create(req, res) {
    try {
      const userId = req.userId;
      const { order_id, type, reason, images } = req.body;
      if (!order_id || !reason || !String(reason).trim()) {
        return res.json({ code: 1, message: '请填写售后原因' });
      }

      const order = await Order.findById(order_id);
      if (!order || Number(order.user_id) !== Number(userId)) {
        return res.json({ code: 1, message: '订单不存在或无权限' });
      }

      const status = Number(order.status);
      if (![2, 3, 4].includes(status)) {
        return res.json({ code: 1, message: '当前订单状态不可申请售后' });
      }
      if (await AfterSales.hasPending(order_id)) {
        return res.json({ code: 1, message: '该订单已有待处理的售后申请' });
      }

      const requestType = type || 'refund';
      const id = await AfterSales.create({
        order_id,
        user_id: userId,
        type: requestType,
        reason: String(reason).trim(),
        images: images || []
      });

      res.json({ code: 0, message: '售后申请已提交', data: { id } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getByOrder(req, res) {
    try {
      const { orderId } = req.params;
      const order = await Order.findById(orderId);
      if (!order || Number(order.user_id) !== Number(req.userId)) {
        return res.json({ code: 1, message: '订单不存在或无权限' });
      }
      const list = await AfterSales.findByOrderId(orderId);
      res.json({ code: 0, data: list });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async list(req, res) {
    try {
      const { status, page, limit } = req.query;
      const result = await AfterSales.list({ status, page, limit });
      res.json({ code: 0, data: result });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getDetail(req, res) {
    try {
      const item = await AfterSales.findById(req.params.id);
      if (!item) {
        return res.json({ code: 1, message: '售后申请不存在' });
      }
      res.json({ code: 0, data: item });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async approve(req, res) {
    try {
      const { id } = req.params;
      const { admin_reply, refund_amount } = req.body;
      const item = await AfterSales.findById(id);
      if (!item) {
        return res.json({ code: 1, message: '售后申请不存在' });
      }
      if (Number(item.status) !== 0) {
        return res.json({ code: 1, message: '该申请已处理' });
      }

      const order = await Order.findById(item.order_id);
      if (!order) {
        return res.json({ code: 1, message: '关联订单不存在' });
      }

      let finalRefund = parseFloat(refund_amount);
      if (!Number.isFinite(finalRefund)) {
        await initOrderServices(item.order_id, order.service_count);
        try {
          const calc = await calculateRefund(item.order_id);
          finalRefund = Number(calc.refund_amount) || 0;
        } catch (_) {
          finalRefund = parseFloat(order.paid_amount) || parseFloat(order.total_price) || 0;
        }
      }

      await AfterSales.updateStatus(id, 1, {
        admin_reply: admin_reply || '已同意售后申请',
        refund_amount: finalRefund
      });

      if (![5, 6, 7].includes(Number(order.status))) {
        await db.execute(
          `UPDATE orders SET status = 6, refund_reason = ?, refund_amount = ?,
           refund_result = 'pending' WHERE id = ?`,
          [item.reason, finalRefund, item.order_id]
        );
        const updated = await Order.findById(item.order_id);
        await notifyRefundPending(updated);
      }

      res.json({ code: 0, message: '已同意售后申请' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async reject(req, res) {
    try {
      const { id } = req.params;
      const { admin_reply } = req.body;
      const item = await AfterSales.findById(id);
      if (!item) {
        return res.json({ code: 1, message: '售后申请不存在' });
      }
      if (Number(item.status) !== 0) {
        return res.json({ code: 1, message: '该申请已处理' });
      }

      await AfterSales.updateStatus(id, 2, {
        admin_reply: admin_reply || '已拒绝售后申请'
      });

      res.json({ code: 0, message: '已拒绝售后申请' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = AfterSalesController;
