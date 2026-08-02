const db = require('./db');
const {
  initOrderServices,
  getOrderServiceUsage,
  markOneServiceUsed
} = require('./refundHelper');
const { buildScheduleInfo } = require('./serviceHelper');
const { isProviderAvailableForService } = require('./providerAvailability');
const { awardPartialCardSessionPoints } = require('./pointsHelper');
const { executeSessionCompletion } = require('./orderCompletionHelper');

function formatServiceDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(value).split('T')[0].split(' ')[0].trim();
  return str || null;
}

function isUnsetServiceDate(value) {
  return value == null || value === '' || value === '0000-00-00';
}

function isMultiCardOrder(order) {
  return (Number(order?.service_count) || 1) > 1;
}

async function ensureOrderServices(order) {
  if (!isMultiCardOrder(order)) return getOrderServiceUsage(order.id);
  await initOrderServices(order.id, order.service_count);
  return getOrderServiceUsage(order.id);
}

async function canOrderBookNext(orderId, usage, status) {
  if (usage.unused <= 0 || usage.used <= 0 || ![1, 2].includes(Number(status))) {
    return false;
  }
  const rows = await db.query(
    `SELECT service_date FROM order_services
     WHERE order_id = ? AND status = 0
     ORDER BY id ASC LIMIT 1`,
    [orderId]
  );
  const next = rows[0];
  return !next || isUnsetServiceDate(next.service_date);
}

async function enrichOrderWithCardInfo(order) {
  if (!order) return order;
  if (!isMultiCardOrder(order)) {
    return {
      ...order,
      is_multi_card: false,
      purchase_type: 'single',
      card_total: 1,
      card_used: Number(order.status) === 4 ? 1 : 0,
      card_remaining: Number(order.status) === 4 ? 0 : 1
    };
  }

  const usage = await ensureOrderServices(order);
  const status = Number(order.status);
  const canModifyBase = [1, 2].includes(status) && !order.group_activity_id;
  const canBookNext = await canOrderBookNext(order.id, usage, status);

  return {
    ...order,
    is_multi_card: true,
    purchase_type: 'card',
    card_total: usage.total,
    card_used: usage.used,
    card_remaining: usage.unused,
    card_progress_text: `已用 ${usage.used}/${usage.total} 次，剩余 ${usage.unused} 次`,
    can_book_next: canBookNext,
    can_modify_schedule: canBookNext ? false : (order.can_modify_schedule ?? canModifyBase)
  };
}

async function completeOneCardSession(orderId, providerId) {
  return executeSessionCompletion(orderId, providerId);
}

async function bookNextCardSession(orderId, userId, schedule) {
  const orders = await db.query(
    `SELECT o.*, s.type_id, s.weekdays, s.time_slots
     FROM orders o
     LEFT JOIN services s ON o.service_id = s.id
     WHERE o.id = ? AND o.user_id = ?`,
    [orderId, userId]
  );
  if (!orders.length) throw new Error('订单不存在或无权限');
  const order = orders[0];

  if (!isMultiCardOrder(order)) {
    throw new Error('该订单不是多次卡订单');
  }
  if (order.group_activity_id) {
    throw new Error('组团游订单不可预约下次');
  }

  const usage = await ensureOrderServices(order);
  if (usage.unused <= 0) {
    throw new Error('多次卡次数已用完');
  }
  if (usage.used <= 0) {
    throw new Error('请先完成首次服务后再预约下次');
  }
  const nextRows = await db.query(
    `SELECT service_date FROM order_services
     WHERE order_id = ? AND status = 0
     ORDER BY id ASC LIMIT 1`,
    [orderId]
  );
  if (nextRows[0] && !isUnsetServiceDate(nextRows[0].service_date)) {
    throw new Error('当前已有下次预约，请等待本次服务完成');
  }
  if (![1, 2].includes(Number(order.status))) {
    throw new Error('当前状态不可预约下次服务');
  }

  let { scheduled_date, scheduled_time } = schedule;
  if (!scheduled_date || !scheduled_time) {
    throw new Error('请选择预约时间');
  }

  scheduled_date = String(scheduled_date).split('T')[0].split(' ')[0];
  scheduled_time = String(scheduled_time).trim();
  if (scheduled_time.includes('-')) {
    scheduled_time = scheduled_time.split('-')[0].trim();
  }
  scheduled_time = scheduled_time.slice(0, 5);

  const serviceRows = await db.query('SELECT * FROM services WHERE id = ?', [order.service_id]);
  const service = serviceRows[0];
  if (service) {
    const scheduleInfo = buildScheduleInfo(service);
    const dateOk = scheduleInfo.available_dates.some((d) => d.date === scheduled_date);
    if (!dateOk) throw new Error('所选日期不在可预约范围内');
    const slot = scheduleInfo.time_slots.find(
      (t) => t.start === scheduled_time || t.name === scheduled_time
    );
    if (!slot) throw new Error('所选时段不在可预约范围内');
    scheduled_time = slot.start;
  }

  if (order.provider_id) {
    const available = await isProviderAvailableForService(
      order.provider_id,
      scheduled_date,
      scheduled_time,
      order.id
    );
    if (!available) {
      throw new Error('该服务人员此时段不可预约，请重新选择');
    }
  }

  await db.execute(
    'UPDATE orders SET scheduled_date = ?, scheduled_time = ?, status = 2 WHERE id = ?',
    [scheduled_date, scheduled_time, orderId]
  );

  await db.execute(
    `UPDATE order_services SET service_date = ?, start_time = ?
     WHERE order_id = ? AND status = 0 AND service_date IS NULL
     ORDER BY id ASC LIMIT 1`,
    [scheduled_date, scheduled_time, orderId]
  );

  const updated = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  return enrichOrderWithCardInfo(updated[0]);
}

module.exports = {
  isMultiCardOrder,
  ensureOrderServices,
  enrichOrderWithCardInfo,
  completeOneCardSession,
  bookNextCardSession
};
