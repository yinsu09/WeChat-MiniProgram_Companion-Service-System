const db = require('./db');
const {
  markOneServiceUsed,
  getOrderServiceUsage,
  initOrderServices
} = require('./refundHelper');
const { awardPartialCardSessionPoints, awardOrderPoints } = require('./pointsHelper');
const { notifyPendingReviews } = require('./notificationHelper');
const { recalculateProviderLevel } = require('./providerLevel');

function isMultiCardOrder(order) {
  return (Number(order?.service_count) || 1) > 1;
}

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

function enrichCompletionFields(order) {
  const userConfirmed = Number(order.user_complete_confirmed) === 1;
  const providerConfirmed = Number(order.provider_complete_confirmed) === 1;
  const paused = Number(order.service_paused) === 1;
  const status = Number(order.status);

  let completion_hint = '';
  if (status === 3 && !paused) {
    if (userConfirmed && !providerConfirmed) {
      completion_hint = '您已确认完成，等待服务人员确认';
    } else if (providerConfirmed && !userConfirmed) {
      completion_hint = '对方已确认完成订单，请确认';
    } else if (userConfirmed && providerConfirmed) {
      completion_hint = '双方已确认，订单即将完成';
    }
  }
  if (paused && status === 3) {
    completion_hint = '服务已暂停';
  }

  return {
    user_complete_confirmed: userConfirmed,
    provider_complete_confirmed: providerConfirmed,
    service_paused: paused,
    completion_hint,
    can_user_confirm_complete: status === 3 && !paused && !userConfirmed,
    can_provider_confirm_complete: status === 3 && !paused && !providerConfirmed,
    can_pause_service: status === 3 && !paused,
    can_resume_service: status === 3 && paused
  };
}

async function resetCompletionFlags(orderId) {
  await db.execute(
    `UPDATE orders SET user_complete_confirmed = 0, provider_complete_confirmed = 0
     WHERE id = ?`,
    [orderId]
  );
}

async function executeSessionCompletion(orderId, providerId) {
  const orders = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!orders.length) throw new Error('订单不存在');
  const order = orders[0];

  if (Number(order.status) !== 3) {
    throw new Error('订单不在服务中');
  }
  if (Number(order.service_paused) === 1) {
    throw new Error('服务已暂停，请先恢复服务');
  }

  if (!isMultiCardOrder(order)) {
    await db.execute(
      `UPDATE orders SET status = 4, user_complete_confirmed = 0, provider_complete_confirmed = 0
       WHERE id = ?`,
      [orderId]
    );
    await markOneServiceUsed(orderId, providerId);
    await awardOrderPoints(orderId);
    await notifyPendingReviews(order);
    await recalculateProviderLevel(providerId);
    return { orderComplete: true, remaining: 0, used: 1, total: 1 };
  }

  await initOrderServices(orderId, order.service_count);
  const usageBefore = await getOrderServiceUsage(orderId);
  if (usageBefore.unused <= 0) {
    await db.execute(
      `UPDATE orders SET status = 4, user_complete_confirmed = 0, provider_complete_confirmed = 0
       WHERE id = ?`,
      [orderId]
    );
    await awardOrderPoints(orderId);
    await notifyPendingReviews(order);
    await recalculateProviderLevel(providerId);
    return {
      orderComplete: true,
      remaining: 0,
      used: usageBefore.used,
      total: usageBefore.total
    };
  }

  await markOneServiceUsed(orderId, providerId);
  const serviceDate = formatServiceDate(order.scheduled_date);
  const serviceTime = order.scheduled_time ? String(order.scheduled_time).slice(0, 5) : null;
  if (serviceDate) {
    await db.execute(
      `UPDATE order_services SET service_date = ?, start_time = ?
       WHERE order_id = ? AND status = 1
       ORDER BY id DESC LIMIT 1`,
      [serviceDate, serviceTime, orderId]
    );
  }

  await awardPartialCardSessionPoints(orderId);

  const usageAfter = await getOrderServiceUsage(orderId);
  if (usageAfter.unused <= 0) {
    await db.execute(
      `UPDATE orders SET status = 4, user_complete_confirmed = 0, provider_complete_confirmed = 0
       WHERE id = ?`,
      [orderId]
    );
    await awardOrderPoints(orderId);
    await notifyPendingReviews(order);
    await recalculateProviderLevel(providerId);
    return {
      orderComplete: true,
      remaining: 0,
      used: usageAfter.used,
      total: usageAfter.total
    };
  }

  await db.execute(
    `UPDATE orders SET status = 2, user_complete_confirmed = 0, provider_complete_confirmed = 0
     WHERE id = ?`,
    [orderId]
  );
  return {
    orderComplete: false,
    remaining: usageAfter.unused,
    used: usageAfter.used,
    total: usageAfter.total
  };
}

async function verifyBothConfirmed(orderId) {
  const rows = await db.query(
    'SELECT user_complete_confirmed, provider_complete_confirmed FROM orders WHERE id = ?',
    [orderId]
  );
  if (!rows.length) throw new Error('订单不存在');
  return Number(rows[0].user_complete_confirmed) === 1
    && Number(rows[0].provider_complete_confirmed) === 1;
}

async function providerConfirmComplete(orderId, providerId) {
  const rows = await db.query(
    'SELECT * FROM orders WHERE id = ? AND provider_id = ?',
    [orderId, providerId]
  );
  if (!rows.length) throw new Error('订单不存在或无权限');
  const order = rows[0];

  if (Number(order.status) !== 3) {
    throw new Error('请先开始服务后再确认完成');
  }
  if (Number(order.service_paused) === 1) {
    throw new Error('服务已暂停，请先恢复服务');
  }
  if (Number(order.provider_complete_confirmed) === 1) {
    throw new Error('您已确认完成');
  }

  await db.execute(
    'UPDATE orders SET provider_complete_confirmed = 1 WHERE id = ?',
    [orderId]
  );

  if (await verifyBothConfirmed(orderId)) {
    return executeSessionCompletion(orderId, providerId);
  }

  return {
    orderComplete: false,
    waitingFor: 'user',
    message: '已确认完成，等待用户确认'
  };
}

async function userConfirmComplete(orderId, userId) {
  const rows = await db.query(
    'SELECT * FROM orders WHERE id = ? AND user_id = ?',
    [orderId, userId]
  );
  if (!rows.length) throw new Error('订单不存在或无权限');
  const order = rows[0];

  if (Number(order.status) !== 3) {
    throw new Error('当前状态不可确认完成');
  }
  if (Number(order.service_paused) === 1) {
    throw new Error('服务已暂停，请先恢复服务');
  }
  if (Number(order.user_complete_confirmed) === 1) {
    throw new Error('您已确认完成');
  }

  await db.execute(
    'UPDATE orders SET user_complete_confirmed = 1 WHERE id = ?',
    [orderId]
  );

  if (await verifyBothConfirmed(orderId)) {
    return executeSessionCompletion(orderId, order.provider_id);
  }

  return {
    orderComplete: false,
    waitingFor: 'provider',
    message: '已确认完成，等待服务人员确认'
  };
}

async function pauseService(orderId, userId) {
  const rows = await db.query(
    'SELECT * FROM orders WHERE id = ? AND user_id = ?',
    [orderId, userId]
  );
  if (!rows.length) throw new Error('订单不存在或无权限');
  if (Number(rows[0].status) !== 3) {
    throw new Error('仅服务中订单可暂停');
  }
  if (Number(rows[0].service_paused) === 1) {
    throw new Error('服务已处于暂停状态');
  }
  await db.execute('UPDATE orders SET service_paused = 1 WHERE id = ?', [orderId]);
  return { service_paused: true };
}

async function resumeService(orderId, userId) {
  const rows = await db.query(
    'SELECT * FROM orders WHERE id = ? AND user_id = ?',
    [orderId, userId]
  );
  if (!rows.length) throw new Error('订单不存在或无权限');
  if (Number(rows[0].status) !== 3) {
    throw new Error('仅服务中订单可恢复');
  }
  if (Number(rows[0].service_paused) !== 1) {
    throw new Error('服务未暂停');
  }
  await db.execute('UPDATE orders SET service_paused = 0 WHERE id = ?', [orderId]);
  return { service_paused: false };
}

module.exports = {
  enrichCompletionFields,
  resetCompletionFlags,
  executeSessionCompletion,
  providerConfirmComplete,
  userConfirmComplete,
  pauseService,
  resumeService
};
