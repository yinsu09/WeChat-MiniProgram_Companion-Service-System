const db = require('./db');

async function getProviderWorkMode(providerId) {
  const rows = await db.query(
    'SELECT work_mode FROM service_providers WHERE id = ?',
    [providerId]
  );
  return rows.length ? Number(rows[0].work_mode ?? 1) : 1;
}

async function getActiveRestPeriods(providerId, at = new Date()) {
  const now = at instanceof Date ? at : new Date(at);
  const rows = await db.query(
    `SELECT * FROM provider_rest_periods
     WHERE provider_id = ? AND end_time > ?
     ORDER BY start_time ASC`,
    [providerId, now]
  );
  return rows;
}

async function isProviderInRest(providerId, at = new Date()) {
  const workMode = await getProviderWorkMode(providerId);
  if (workMode === 0) return true;

  const now = at instanceof Date ? at : new Date(at);
  const rows = await db.query(
    `SELECT id FROM provider_rest_periods
     WHERE provider_id = ? AND start_time <= ? AND end_time > ?
     LIMIT 1`,
    [providerId, now, now]
  );
  return rows.length > 0;
}

async function getProviderRestInfo(providerId) {
  const rows = await db.query(
    'SELECT work_mode FROM service_providers WHERE id = ?',
    [providerId]
  );
  const workMode = rows.length ? Number(rows[0].work_mode ?? 1) : 1;
  const periods = await db.query(
    `SELECT id, start_time, end_time FROM provider_rest_periods
     WHERE provider_id = ? AND end_time > NOW()
     ORDER BY start_time ASC`,
    [providerId]
  );
  return {
    work_mode: workMode,
    work_mode_text: workMode === 1 ? '工作中' : '休息中',
    rest_periods: periods
  };
}

async function setWorkMode(providerId, workMode) {
  const mode = Number(workMode) === 0 ? 0 : 1;
  await db.execute(
    'UPDATE service_providers SET work_mode = ? WHERE id = ?',
    [mode, providerId]
  );
  if (mode === 0) {
    await db.execute(
      'UPDATE service_providers SET available = 0 WHERE id = ?',
      [providerId]
    );
  }
  return mode;
}

async function addRestPeriod(providerId, startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('休息时段格式无效');
  }
  if (end <= start) {
    throw new Error('结束时间须晚于开始时间');
  }
  const result = await db.execute(
    `INSERT INTO provider_rest_periods (provider_id, start_time, end_time)
     VALUES (?, ?, ?)`,
    [providerId, start, end]
  );
  const now = new Date();
  if (start <= now && end > now) {
    await db.execute(
      'UPDATE service_providers SET available = 0 WHERE id = ?',
      [providerId]
    );
  }
  return result.insertId;
}

async function deleteRestPeriod(providerId, periodId) {
  await db.execute(
    'DELETE FROM provider_rest_periods WHERE id = ? AND provider_id = ?',
    [periodId, providerId]
  );
}

async function syncProviderAvailabilityAfterRest(providerId) {
  const inRest = await isProviderInRest(providerId);
  if (inRest) {
    await db.execute(
      'UPDATE service_providers SET available = 0 WHERE id = ?',
      [providerId]
    );
    return;
  }
  const ongoing = await db.query(
    'SELECT id FROM orders WHERE provider_id = ? AND status = 3 LIMIT 1',
    [providerId]
  );
  if (!ongoing.length) {
    await db.execute(
      'UPDATE service_providers SET available = 1 WHERE id = ?',
      [providerId]
    );
  }
}

module.exports = {
  getProviderWorkMode,
  getActiveRestPeriods,
  isProviderInRest,
  getProviderRestInfo,
  setWorkMode,
  addRestPeriod,
  deleteRestPeriod,
  syncProviderAvailabilityAfterRest
};
