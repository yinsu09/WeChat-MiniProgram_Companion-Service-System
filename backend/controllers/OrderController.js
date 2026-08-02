const Order = require('../models/Order');
const Service = require('../models/Service');
const db = require('../utils/db');
const { resolveServicePublisher, buildScheduleInfo, resolveServicePrice } = require('../utils/serviceHelper');
const { isProviderAvailable, isProviderAvailableForService, hasOrderConflict } = require('../utils/providerAvailability');
const CustomOrderHelper = require('../utils/customOrderHelper');
const { notifyProviderNewOrder } = require('../utils/notificationHelper');
const { getActiveDiscountForService, applyLimitedDiscount } = require('../utils/discountHelper');
const { initOrderServices } = require('../utils/refundHelper');
const { enrichUserOrder } = require('../utils/orderDisplayHelper');
const { syncAllEndedGroupActivities } = require('../utils/groupTourHelper');
const { enrichOrderWithCardInfo, bookNextCardSession } = require('../utils/cardOrderHelper');
const {
  enrichCompletionFields,
  userConfirmComplete,
  pauseService,
  resumeService
} = require('../utils/orderCompletionHelper');
const AfterSales = require('../models/AfterSales');

function formatOrderDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).split('T')[0].split(' ')[0];
}

function normalizeScheduledTime(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (str.includes('-') && str.includes(':')) {
    return str.split('-')[0].trim();
  }
  return str.slice(0, 5);
}

/** 服务端统一计算订单原价（不含限时折扣/优惠券），避免前端折后价被重复打折 */
async function computeOrderBasePrice(serviceId, unitPrice, count, packageId) {
  let basePrice = unitPrice * count;
  if (packageId) {
    const packages = await db.query(
      'SELECT * FROM service_packages WHERE id = ? AND service_id = ?',
      [packageId, serviceId]
    );
    if (packages[0]) {
      basePrice = parseFloat(packages[0].price) || basePrice;
    }
  }
  return Number(basePrice.toFixed(2));
}

class OrderController {
  static async createOrder(req, res) {
    try {
      const {
        service_id,
        package_id,
        service_count,
        scheduled_date,
        scheduled_time,
        assign_type,
        provider_id,
        total_amount,
        user_coupon_id
      } = req.body;

      const service = await Service.getById(service_id);
      if (!service) {
        return res.json({ code: -1, message: '服务不存在' });
      }

      const publisher = await resolveServicePublisher(service);
      const finalProviderId = provider_id || publisher?.id;
      if (!finalProviderId) {
        return res.json({ code: -1, message: '服务人员信息缺失，无法下单' });
      }

      const providerLevel = publisher?.level ?? 1;
      const unitPrice = resolveServicePrice(service, providerLevel);
      const count = parseInt(service_count, 10) || 1;

      // 始终以服务端原价为准，不使用前端传来的折后 total_amount
      let total_price = await computeOrderBasePrice(service_id, unitPrice, count, package_id);
      const baseBeforePromotion = total_price;

      if (scheduled_date && scheduled_time) {
        const schedule = buildScheduleInfo(service);
        const dateOk = schedule.available_dates.some((d) => d.date === scheduled_date);
        if (!dateOk) {
          return res.json({ code: -1, message: '所选日期不在可预约范围内' });
        }
        const timeOk = schedule.time_slots.some(
          (t) => t.start === scheduled_time || t.name === scheduled_time
        );
        if (!timeOk) {
          return res.json({ code: -1, message: '所选时段不在可预约范围内' });
        }

        const normalizedTime = normalizeScheduledTime(scheduled_time);
        const available = await isProviderAvailableForService(
          finalProviderId,
          scheduled_date,
          normalizedTime
        );
        if (!available) {
          return res.json({ code: -1, message: '该服务人员此时段不可预约' });
        }
      }

      let promotion_discount = 0;
      let discount_id = null;
      const activeDiscount = await getActiveDiscountForService(service.type_id, service_id);
      if (activeDiscount) {
        const discountResult = applyLimitedDiscount(baseBeforePromotion, activeDiscount.discount);
        promotion_discount = discountResult.saved;
        total_price = discountResult.finalPrice;
        discount_id = activeDiscount.id;
      }

      let discount_amount = 0;
      let userCouponId = user_coupon_id || null;
      if (userCouponId) {
        const couponResult = await CustomOrderHelper.applyUserCoupon(req.userId, userCouponId, total_price);
        discount_amount = couponResult.discount;
        total_price = couponResult.finalPrice;
      }

      const order_no = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
      const orderId = await Order.create({
        order_no,
        user_id: req.userId,
        service_id,
        package_id,
        service_count: count,
        scheduled_date,
        scheduled_time,
        total_price,
        discount_amount,
        promotion_discount,
        discount_id,
        user_coupon_id: userCouponId,
        assign_type: assign_type ?? 1,
        is_custom: 0
      });
      await Order.updateProvider(orderId, finalProviderId);
      if (userCouponId) {
        await CustomOrderHelper.markCouponUsed(userCouponId, orderId);
      }
      await Order.payOrder(orderId, req.userId);
      await initOrderServices(orderId, count);
      await notifyProviderNewOrder(finalProviderId, order_no, service.name);

      res.json({ code: 0, data: { order_id: orderId, order_no, total_price, discount_amount, promotion_discount } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async createCustomOrder(req, res) {
    try {
      const {
        type_id,
        provider_id,
        custom_requirements,
        scheduled_date,
        scheduled_time,
        user_coupon_id,
        assign_type = 1
      } = req.body;

      if (!type_id || !custom_requirements || !scheduled_date || !scheduled_time) {
        return res.json({ code: -1, message: '请完整填写指定服务信息' });
      }

      const useSystemAssign = Number(assign_type) === 0;
      if (!useSystemAssign && !provider_id) {
        return res.json({ code: -1, message: '请选择服务人员或选择系统指派' });
      }

      if (!useSystemAssign) {
        const available = await isProviderAvailable(provider_id, type_id, scheduled_date, scheduled_time);
        if (!available) {
          return res.json({ code: -1, message: '该服务人员此时段不可预约，请重新选择' });
        }
      }

      const template = await CustomOrderHelper.getCustomServiceTemplate(type_id);
      let total_price = parseFloat(template.base_price) || 100;
      let discount_amount = 0;
      let userCouponId = user_coupon_id || null;

      if (userCouponId) {
        const couponResult = await CustomOrderHelper.applyUserCoupon(req.userId, userCouponId, total_price);
        discount_amount = couponResult.discount;
        total_price = couponResult.finalPrice;
      }

      const order_no = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
      const orderId = await Order.create({
        order_no,
        user_id: req.userId,
        service_id: template.id,
        service_count: 1,
        scheduled_date,
        scheduled_time,
        total_price,
        discount_amount,
        user_coupon_id: userCouponId,
        custom_requirements,
        assign_type: useSystemAssign ? 0 : 1,
        is_custom: 1
      });

      if (useSystemAssign) {
        await Order.payOrder(orderId, req.userId);
        await initOrderServices(orderId, 1);
      } else {
        await Order.updateProvider(orderId, provider_id);
        await Order.payOrder(orderId, req.userId);
        await initOrderServices(orderId, 1);
        await notifyProviderNewOrder(provider_id, order_no, `定制服务-${template.name || ''}`);
      }

      if (userCouponId) {
        await CustomOrderHelper.markCouponUsed(userCouponId, orderId);
      }

      res.json({
        code: 0,
        data: { order_id: orderId, order_no, total_price, discount_amount },
        message: useSystemAssign ? '指定服务已提交，等待管理端指派' : '指定服务下单成功'
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getCheckoutCoupons(req, res) {
    try {
      const { amount = 0 } = req.query;
      const orderAmount = parseFloat(amount) || 0;
      const rows = await db.query(
        `SELECT uc.id, uc.name, uc.type_name, uc.value, uc.min_amount, uc.expire_time,
                c.type AS coupon_type, c.discount_value, c.min_amount AS coupon_min_amount
         FROM user_coupons uc
         LEFT JOIN coupons c ON uc.coupon_id = c.id
         WHERE uc.user_id = ? AND uc.status = 1
           AND (uc.type_name IS NULL OR uc.type_name NOT IN ('积分券', '组团游'))
           AND (uc.expire_time IS NULL OR uc.expire_time > NOW())
         ORDER BY uc.expire_time ASC`,
        [req.userId]
      );

      const coupons = rows.map((row) => {
        const minAmount = row.coupon_min_amount ?? row.min_amount ?? 0;
        const usable = orderAmount >= parseFloat(minAmount);
        return {
          id: row.id,
          name: row.name,
          type_name: row.type_name || (Number(row.coupon_type) === 2 ? '折扣券' : '满减券'),
          value: row.discount_value ?? row.value,
          min_amount: minAmount,
          expire_time: row.expire_time,
          usable
        };
      });

      res.json({ code: 0, data: coupons });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getUserOrders(req, res) {
    try {
      await syncAllEndedGroupActivities();
      const { page = 1, pageSize = 20 } = req.query;
      const result = await Order.findDetailedByUserId(req.userId, parseInt(page, 10), parseInt(pageSize, 10));
      const rows = await Promise.all(result.rows.map(async (order) => enrichUserOrder({
        ...(await enrichOrderWithCardInfo(order)),
        is_reviewed: !!order.is_reviewed,
        is_group_tour: !!order.group_activity_id,
        assign_label: order.group_activity_id
          ? '组团游订单'
          : order.is_custom
            ? (order.provider_id ? '已指定服务人员' : '系统指派（待管理端分配）')
            : (order.provider_id ? '服务人员已绑定' : '待指派')
      })));
      res.json({ code: 0, data: { ...result, rows } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getOrderDetail(req, res) {
    try {
      const { id } = req.params;
      const order = await Order.findDetailedById(id);
      if (!order) {
        return res.json({ code: -1, message: '订单不存在' });
      }
      if (order.user_id !== req.userId) {
        return res.json({ code: -1, message: '无权查看该订单' });
      }

      let scheduleOptions = null;
      const cardInfo = await enrichOrderWithCardInfo({
        ...order,
        scheduled_date: formatOrderDate(order.scheduled_date),
        scheduled_time: order.scheduled_time || '',
        is_group_tour: !!order.group_activity_id,
        can_modify_schedule: [1, 2].includes(Number(order.status)) && !order.group_activity_id,
        assign_label: order.is_custom
          ? (order.provider_id ? '已指定服务人员' : '系统指派（待管理端分配）')
          : (order.provider_id ? '服务人员已绑定' : '待指派')
      });

      if (
        order.service_id
        && [1, 2].includes(Number(order.status))
        && !order.group_activity_id
        && (cardInfo.can_modify_schedule || cardInfo.can_book_next)
      ) {
        const service = await Service.getById(order.service_id);
        if (service) {
          scheduleOptions = buildScheduleInfo(service);
        }
      }

      res.json({
        code: 0,
        data: enrichUserOrder(enrichCompletionFields({
          ...cardInfo,
          schedule_options: scheduleOptions,
          after_sales: await AfterSales.findByOrderId(id)
        }))
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async bookNextSession(req, res) {
    try {
      const { id } = req.params;
      const { scheduled_date, scheduled_time } = req.body;
      const updated = await bookNextCardSession(id, req.userId, {
        scheduled_date,
        scheduled_time
      });

      let scheduleOptions = null;
      if (updated.service_id && [1, 2].includes(Number(updated.status))) {
        const service = await Service.getById(updated.service_id);
        if (service) {
          scheduleOptions = buildScheduleInfo(service);
        }
      }

      res.json({
        code: 0,
        message: '下次服务预约成功',
        data: enrichUserOrder({
          ...updated,
          scheduled_date: formatOrderDate(updated.scheduled_date),
          schedule_options: scheduleOptions
        })
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateOrderStatus(req, res) {
    try {
      const { id, status } = req.body;
      await Order.updateStatus(id, status);
      res.json({ code: 0, message: '更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async requestRefund(req, res) {
    try {
      const { orderId, reason } = req.body;
      const calc = await Order.requestRefund(orderId, reason || '用户取消订单', req.userId);
      res.json({
        code: 0,
        message: '订单已取消，退款申请已提交',
        data: calc
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async payOrder(req, res) {
    try {
      const { id } = req.params;
      await Order.payOrder(id, req.userId);
      res.json({ code: 0, message: '支付成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateOrder(req, res) {
    try {
      const { id } = req.params;
      let { scheduled_date, scheduled_time } = req.body;
      if (!scheduled_date || !scheduled_time) {
        return res.json({ code: -1, message: '请选择预约时间' });
      }

      scheduled_date = formatOrderDate(scheduled_date);
      scheduled_time = normalizeScheduledTime(scheduled_time);

      const order = await Order.findById(id);
      if (!order) {
        return res.json({ code: -1, message: '订单不存在' });
      }
      if (order.user_id !== req.userId) {
        return res.json({ code: -1, message: '无权修改该订单' });
      }
      if (![1, 2].includes(Number(order.status))) {
        return res.json({ code: -1, message: '当前状态不可修改预约' });
      }
      if (order.group_activity_id) {
        return res.json({ code: -1, message: '组团游订单不可修改预约' });
      }

      const service = await Service.getById(order.service_id);
      if (service) {
        const schedule = buildScheduleInfo(service);
        const dateOk = schedule.available_dates.some((d) => d.date === scheduled_date);
        if (!dateOk) {
          return res.json({ code: -1, message: '所选日期不在可预约范围内' });
        }
        const timeOk = schedule.time_slots.some(
          (t) => t.start === scheduled_time || t.name === scheduled_time
        );
        if (!timeOk) {
          return res.json({ code: -1, message: '所选时段不在可预约范围内' });
        }
        const slot = schedule.time_slots.find(
          (t) => t.start === scheduled_time || t.name === scheduled_time
        );
        if (slot) {
          scheduled_time = slot.start;
        }
      }

      if (order.provider_id) {
        const conflict = await hasOrderConflict(
          order.provider_id,
          scheduled_date,
          scheduled_time,
          order.id
        );
        if (conflict) {
          return res.json({ code: -1, message: '该服务人员此时段不可预约，请重新选择' });
        }
      }

      const updated = await Order.updateSchedule(id, req.userId, {
        scheduled_date,
        scheduled_time
      });
      res.json({
        code: 0,
        message: '修改成功',
        data: updated
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async cancelOrder(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body || {};
      const calc = await Order.cancelByUser(id, req.userId, reason);
      const message = Number(calc.refund_amount) > 0
        ? `订单已取消，预计退款 ¥${calc.refund_amount}，等待管理员审核`
        : '订单已取消';
      res.json({ code: 0, message, data: calc });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async confirmComplete(req, res) {
    try {
      const { id } = req.params;
      const result = await userConfirmComplete(id, req.userId);
      const order = await Order.findDetailedById(id);
      const cardInfo = await enrichOrderWithCardInfo(order);
      let message = result.message;
      if (result.orderComplete) {
        message = cardInfo.is_multi_card && cardInfo.card_remaining > 0
          ? `本次服务已完成，剩余 ${cardInfo.card_remaining} 次`
          : '服务已完成';
      }
      res.json({
        code: 0,
        message,
        data: enrichUserOrder(enrichCompletionFields({ ...cardInfo, ...result }))
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async pauseService(req, res) {
    try {
      const { id } = req.params;
      await pauseService(id, req.userId);
      res.json({ code: 0, message: '服务已暂停' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async resumeService(req, res) {
    try {
      const { id } = req.params;
      await resumeService(id, req.userId);
      res.json({ code: 0, message: '服务已恢复' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = OrderController;
