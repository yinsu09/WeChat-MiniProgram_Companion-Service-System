const db = require('./db');
const { notifyProviderNewOrder } = require('./orderNotifyHelper');

async function countGroupParticipants(activityId) {
  const rows = await db.query(
    `SELECT COUNT(*) AS count FROM orders
     WHERE group_activity_id = ? AND status NOT IN (5, 7)`,
    [activityId]
  );
  return rows[0]?.count || 0;
}

async function hasUserJoinedGroup(userId, activityId) {
  const rows = await db.query(
    `SELECT id FROM orders
     WHERE user_id = ? AND group_activity_id = ? AND status NOT IN (5, 7)`,
    [userId, activityId]
  );
  return rows.length > 0;
}

async function getGroupServiceTemplate(activityName, price, providerId) {
  const name = `【组团】${activityName}`;
  const rows = await db.query('SELECT * FROM services WHERE name = ? LIMIT 1', [name]);
  if (rows.length) {
    return rows[0];
  }

  const result = await db.execute(
    `INSERT INTO services (type_id, name, description, duration, base_price, status, provider_id)
     VALUES (1, ?, ?, 60, ?, 1, ?)`,
    [name, '组团游活动订单', price, providerId || null]
  );
  return { id: result.insertId, base_price: price, name };
}

function parseActivitySchedule(activity) {
  const validStartStr = activity.valid_start instanceof Date
    ? activity.valid_start.toISOString().replace('T', ' ').slice(0, 19)
    : String(activity.valid_start || '');
  const parts = validStartStr.split(' ');
  return {
    scheduled_date: parts[0] || '',
    scheduled_time: parts[1]?.slice(0, 5) || '09:00'
  };
}

async function createGroupOrder(userId, activity) {
  const price = parseFloat(activity.discount_value) || 0;
  const template = await getGroupServiceTemplate(activity.name, price, activity.provider_id || null);
  const { scheduled_date, scheduled_time } = parseActivitySchedule(activity);
  const orderNo = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();

  const orderResult = await db.execute(
    `INSERT INTO orders (
      order_no, user_id, service_id, service_count, scheduled_date, scheduled_time,
      total_price, assign_type, status, group_activity_id, provider_id, is_custom
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 1, ?, ?, 0)`,
    [
      orderNo,
      userId,
      template.id,
      scheduled_date,
      scheduled_time,
      price,
      activity.provider_id ? 1 : 0,
      activity.id,
      activity.provider_id || null
    ]
  );

  const insertId = orderResult.insertId;
  if (activity.provider_id && Number(activity.provider_assign_status || 0) === 2) {
    await notifyProviderNewOrder(activity.provider_id, orderNo, activity.name);
  }

  return { orderId: insertId, orderNo, scheduled_date, scheduled_time };
}

module.exports = {
  countGroupParticipants,
  hasUserJoinedGroup,
  getGroupServiceTemplate,
  createGroupOrder,
  parseActivitySchedule
};
