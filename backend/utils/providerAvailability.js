const db = require('./db');
const { parseJsonField } = require('./serviceHelper');
const { getLevelName, getLevelColor } = require('./providerLevel');
const { rankProviders } = require('./assignHelper');
const { isProviderInRest } = require('./providerRestHelper');

const TIME_SLOT_MAP = {
  1: { name: '09:00-12:00', start: '09:00' },
  2: { name: '12:00-14:00', start: '12:00' },
  3: { name: '14:00-17:00', start: '14:00' },
  4: { name: '17:00-20:00', start: '17:00' }
};

function resolveTimeSlotId(scheduledTime) {
  const entry = Object.entries(TIME_SLOT_MAP).find(
    ([, slot]) => slot.start === scheduledTime || slot.name === scheduledTime
  );
  return entry ? parseInt(entry[0], 10) : null;
}

async function hasOrderConflict(providerId, scheduledDate, scheduledTime, excludeOrderId = null) {
  let sql = `
    SELECT id FROM orders
    WHERE provider_id = ? AND scheduled_date = ? AND scheduled_time = ?
      AND status NOT IN (5, 7)
  `;
  const params = [providerId, scheduledDate, scheduledTime];
  if (excludeOrderId) {
    sql += ' AND id != ?';
    params.push(excludeOrderId);
  }
  const rows = await db.query(sql, params);
  return rows.length > 0;
}

/** 购买/预约已发布服务：以服务项目上的可预约时段为准，不再重复校验服务人员档案里的 weekdays/type */
async function isProviderAvailableForService(providerId, scheduledDate, scheduledTime, excludeOrderId = null) {
  const rows = await db.query(
    `SELECT sp.id, sp.status, sp.available, u.status AS user_status
     FROM service_providers sp
     INNER JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
     WHERE sp.id = ?`,
    [providerId]
  );
  if (!rows.length) return false;

  const provider = rows[0];
  if (provider.status !== 1 || provider.user_status !== 1 || provider.available !== 1) {
    return false;
  }
  if (await isProviderInRest(providerId)) {
    return false;
  }

  let time = String(scheduledTime || '').trim();
  if (time.includes('-') && time.includes(':')) {
    time = time.split('-')[0].trim();
  }
  time = time.slice(0, 5);

  return !(await hasOrderConflict(providerId, scheduledDate, time, excludeOrderId));
}

async function isProviderAvailable(providerId, typeId, scheduledDate, scheduledTime, excludeOrderId = null) {
  const rows = await db.query(
    `SELECT sp.id, sp.status, sp.available, u.weekdays, u.time_slots, u.service_types, u.status AS user_status
     FROM service_providers sp
     INNER JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
     WHERE sp.id = ?`,
    [providerId]
  );
  if (!rows.length) return false;

  const provider = rows[0];
  if (provider.status !== 1 || provider.user_status !== 1 || provider.available !== 1) {
    return false;
  }
  if (await isProviderInRest(providerId)) {
    return false;
  }

  const serviceTypes = parseJsonField(provider.service_types, []);
  if (!serviceTypes.map(Number).includes(Number(typeId))) {
    return false;
  }

  const weekdays = parseJsonField(provider.weekdays, [1, 2, 3, 4, 5]);
  const timeSlots = parseJsonField(provider.time_slots, [1, 3]);
  const day = new Date(`${scheduledDate}T00:00:00`).getDay();
  if (!weekdays.includes(day)) {
    return false;
  }

  const slotId = resolveTimeSlotId(scheduledTime);
  if (!slotId || !timeSlots.includes(slotId)) {
    return false;
  }

  if (await hasOrderConflict(providerId, scheduledDate, scheduledTime, excludeOrderId)) {
    return false;
  }

  return true;
}

async function getAvailableProvidersByType(typeId, scheduledDate, scheduledTime, userId = null) {
  const rows = await db.query(
    `SELECT sp.id, sp.nickname AS name, sp.avatar_url, sp.level,
            sp.avg_rating AS rating, sp.total_services AS services,
            sp.available, sp.status, u.service_area, u.service_types,
            u.weekdays, u.time_slots
     FROM service_providers sp
     INNER JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
     WHERE sp.status = 1 AND u.status = 1 AND sp.available = 1
       AND JSON_CONTAINS(u.service_types, ?)
     ORDER BY sp.avg_rating DESC, sp.total_services DESC`,
    [JSON.stringify(parseInt(typeId, 10))]
  );

  const available = [];
  for (const row of rows) {
    const ok = await isProviderAvailable(row.id, typeId, scheduledDate, scheduledTime);
    if (!ok) continue;
    available.push({
      id: row.id,
      name: row.name || '服务人员',
      avatar_url: row.avatar_url || '',
      level: row.level || 0,
      level_name: getLevelName(row.level || 0),
      level_color: getLevelColor(row.level || 0),
      rating: parseFloat(row.rating || 0).toFixed(1),
      services: row.services || 0,
      service_count: row.services || 0,
      available: row.available,
      service_area: row.service_area || ''
    });
  }
  return rankProviders(available, userId);
}

function buildTypeScheduleOptions(typeId) {
  return {
    time_slots: Object.entries(TIME_SLOT_MAP).map(([id, slot]) => ({
      id: parseInt(id, 10),
      ...slot
    }))
  };
}

module.exports = {
  getAvailableProvidersByType,
  isProviderAvailable,
  isProviderAvailableForService,
  hasOrderConflict,
  buildTypeScheduleOptions,
  TIME_SLOT_MAP
};
