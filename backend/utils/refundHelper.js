const db = require('./db');

const DEFAULT_RULES = {
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

async function getRefundRules() {
  const rows = await db.query(
    'SELECT config_value FROM system_configs WHERE config_key = ?',
    ['refund_rules']
  );
  if (!rows.length) return { ...DEFAULT_RULES };
  try {
    return { ...DEFAULT_RULES, ...JSON.parse(rows[0].config_value) };
  } catch (_) {
    return { ...DEFAULT_RULES };
  }
}

async function initOrderServices(orderId, serviceCount) {
  const count = Math.max(parseInt(serviceCount, 10) || 1, 1);
  const existing = await db.query('SELECT id FROM order_services WHERE order_id = ? LIMIT 1', [orderId]);
  if (existing.length) return;

  for (let i = 0; i < count; i += 1) {
    await db.execute(
      'INSERT INTO order_services (order_id, status, created_at) VALUES (?, 0, NOW())',
      [orderId]
    );
  }
}

async function getOrderServiceUsage(orderId) {
  const rows = await db.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS used,
       SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) AS unused
     FROM order_services WHERE order_id = ?`,
    [orderId]
  );
  const stats = rows[0] || {};
  return {
    total: Number(stats.total) || 0,
    used: Number(stats.used) || 0,
    unused: Number(stats.unused) || 0
  };
}

async function markOneServiceUsed(orderId, providerId = null) {
  if (providerId) {
    await db.execute(
      'UPDATE order_services SET status = 1, used_by_provider = ? WHERE order_id = ? AND status = 0 ORDER BY id ASC LIMIT 1',
      [providerId, orderId]
    );
    return;
  }
  await db.execute(
    'UPDATE order_services SET status = 1 WHERE order_id = ? AND status = 0 ORDER BY id ASC LIMIT 1',
    [orderId]
  );
}

function hoursUntilService(order) {
  if (!order.scheduled_date || !order.scheduled_time) return 999;
  const scheduled = new Date(`${order.scheduled_date}T${order.scheduled_time}:00`);
  return (scheduled.getTime() - Date.now()) / (1000 * 60 * 60);
}

function calculateSingleRefund(order, rules) {
  const paid = parseFloat(order.paid_amount || order.total_price) || 0;
  const hours = hoursUntilService(order);
  let penaltyRate = 0;

  if (Number(order.status) >= 3 && Number(order.status) !== 6) {
    penaltyRate = rules.cancel_started_rate || 50;
  } else if (hours <= 2) {
    penaltyRate = rules.cancel_2h_rate || 30;
  } else if (hours <= 24) {
    penaltyRate = rules.cancel_24h_rate || 10;
  }

  const penalty = paid * (penaltyRate / 100);
  const serviceFee = paid * ((rules.service_fee_rate || 0) / 100);
  let refund = Math.max(paid - penalty - serviceFee, 0);

  if (refund > 0 && refund < (rules.min_refund_amount || 0)) {
    refund = 0;
  }

  return {
    refund_amount: Number(refund.toFixed(2)),
    penalty_amount: Number(penalty.toFixed(2)),
    service_fee: Number(serviceFee.toFixed(2)),
    unused_count: 0,
    total_count: 1,
    detail: `单次服务退款，违约金${penaltyRate}%`
  };
}

function calculateCardRefund(order, usage, rules) {
  const paid = parseFloat(order.paid_amount || order.total_price) || 0;
  const totalCount = usage.total || Number(order.service_count) || 1;
  const unusedCount = usage.unused ?? Math.max(totalCount - (usage.used || 0), 0);

  if (unusedCount <= 0) {
    return {
      refund_amount: 0,
      penalty_amount: paid,
      service_fee: 0,
      unused_count: 0,
      total_count: totalCount,
      detail: '多次卡已全部使用，不可退款'
    };
  }

  const unusedRatio = unusedCount / totalCount;
  const refundableBase = paid * unusedRatio;
  const cardFee = refundableBase * ((rules.card_refund_rate || 0) / 100);
  const serviceFee = refundableBase * ((rules.service_fee_rate || 0) / 100);
  let refund = Math.max(refundableBase - cardFee - serviceFee, 0);

  if (refund > 0 && refund < (rules.min_refund_amount || 0)) {
    refund = 0;
  }

  return {
    refund_amount: Number(refund.toFixed(2)),
    penalty_amount: Number((refundableBase - refund - serviceFee).toFixed(2)),
    service_fee: Number(serviceFee.toFixed(2)),
    unused_count: unusedCount,
    total_count: totalCount,
    detail: `多次卡剩余${unusedCount}/${totalCount}次，手续费${rules.card_refund_rate}%`
  };
}

async function calculateRefund(orderId) {
  const orders = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!orders.length) throw new Error('订单不存在');
  const order = orders[0];
  const rules = await getRefundRules();
  const usage = await getOrderServiceUsage(orderId);
  const isMultiCard = (usage.total || Number(order.service_count) || 1) > 1;

  // 待审核订单沿用取消时已写入的净退款额，明细项从规则重算（仅展示，不再参与扣减）
  if (Number(order.status) === 6 && order.refund_amount != null) {
    const refundAmount = Number(order.refund_amount) || 0;
    const baseCalc = isMultiCard
      ? calculateCardRefund(order, usage, rules)
      : calculateSingleRefund(order, rules);
    return {
      ...baseCalc,
      refund_amount: refundAmount,
      detail: '按取消时规则已计算'
    };
  }

  if (isMultiCard) {
    return calculateCardRefund(order, usage, rules);
  }
  return calculateSingleRefund(order, rules);
}

module.exports = {
  getRefundRules,
  initOrderServices,
  getOrderServiceUsage,
  markOneServiceUsed,
  calculateRefund,
  calculateCardRefund,
  calculateSingleRefund
};
