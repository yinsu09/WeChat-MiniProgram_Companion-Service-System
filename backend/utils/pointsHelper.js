const db = require('./db');
const { getOrderServiceUsage } = require('./refundHelper');

const CONSUME_POINTS_PER_YUAN = 1;
const REVIEW_BONUS_POINTS = 10;

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function ensurePointsRecordsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS points_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      order_id INT NULL,
      type_name VARCHAR(100) NOT NULL,
      points INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_order_id (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function addPointsRecord(userId, typeName, points, orderId = null) {
  await ensurePointsRecordsTable();
  await db.execute(
    'INSERT INTO points_records (user_id, order_id, type_name, points, created_at) VALUES (?, ?, ?, ?, NOW())',
    [userId, orderId, typeName, points]
  );
}

async function getUserPointsSummary(userId) {
  await ensurePointsRecordsTable();
  const users = await db.query(
    'SELECT points, total_consumed FROM users WHERE id = ?',
    [userId]
  );
  if (!users.length) {
    return {
      points: 0,
      totalConsumed: 0,
      earnedPoints: 0,
      usedPoints: 0,
      recentRecords: []
    };
  }

  const user = users[0];
  let recentRecords = [];
  let earnedPoints = 0;
  let usedPoints = 0;

  try {
    recentRecords = await db.query(
      `SELECT id, type_name, points, created_at, order_id
       FROM points_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );
    const statsRows = await db.query(
      `SELECT
         IFNULL(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0) AS earned,
         IFNULL(SUM(CASE WHEN points < 0 THEN ABS(points) ELSE 0 END), 0) AS used
       FROM points_records WHERE user_id = ?`,
      [userId]
    );
    const stats = statsRows[0] || {};
    earnedPoints = toNumber(stats.earned);
    usedPoints = toNumber(stats.used);
  } catch (_) {
    // 积分记录表异常时不影响余额展示
  }

  return {
    points: toNumber(user.points),
    totalConsumed: toNumber(user.total_consumed),
    earnedPoints,
    usedPoints,
    recentRecords
  };
}

async function awardPartialCardSessionPoints(orderId) {
  const orders = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!orders.length) return;
  const order = orders[0];
  const serviceCount = Math.max(Number(order.service_count) || 1, 1);
  if (serviceCount <= 1) return;

  const usage = await getOrderServiceUsage(orderId);
  const sessionPoints = Math.floor((parseFloat(order.total_price) || 0) / serviceCount);
  if (sessionPoints <= 0) return;

  const alreadyAwarded = Number(order.points_awarded || 0);
  const expectedAwarded = usage.used * sessionPoints;
  const delta = expectedAwarded - alreadyAwarded;
  if (delta <= 0) return;

  await db.execute(
    'UPDATE users SET points = IFNULL(points, 0) + ?, total_consumed = IFNULL(total_consumed, 0) + ? WHERE id = ?',
    [delta, (parseFloat(order.total_price) || 0) / serviceCount, order.user_id]
  );
  await db.execute(
    'UPDATE orders SET points_awarded = IFNULL(points_awarded, 0) + ? WHERE id = ?',
    [delta, orderId]
  );
  await addPointsRecord(order.user_id, '多次卡单次服务奖励', delta, orderId);
}

async function awardOrderPoints(orderId) {
  const orders = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!orders.length) return;
  const order = orders[0];
  if (Number(order.status) !== 4) return;

  const serviceCount = Math.max(Number(order.service_count) || 1, 1);
  if (serviceCount > 1) {
    await awardPartialCardSessionPoints(orderId);
    return;
  }

  if (Number(order.points_awarded || 0) > 0) return;

  const points = Math.floor(parseFloat(order.total_price) || 0) * CONSUME_POINTS_PER_YUAN;
  if (points <= 0) return;

  await db.execute(
    'UPDATE users SET points = IFNULL(points, 0) + ?, total_consumed = IFNULL(total_consumed, 0) + ? WHERE id = ?',
    [points, parseFloat(order.total_price) || 0, order.user_id]
  );
  await db.execute('UPDATE orders SET points_awarded = ? WHERE id = ?', [points, orderId]);
  await addPointsRecord(order.user_id, '订单消费奖励', points, orderId);
}

async function awardReviewPoints(userId, orderId) {
  await ensurePointsRecordsTable();
  const existing = await db.query(
    'SELECT id FROM points_records WHERE user_id = ? AND order_id = ? AND type_name = ?',
    [userId, orderId, '评价奖励']
  );
  if (existing.length) return;

  await db.execute(
    'UPDATE users SET points = IFNULL(points, 0) + ? WHERE id = ?',
    [REVIEW_BONUS_POINTS, userId]
  );
  await addPointsRecord(userId, '评价奖励', REVIEW_BONUS_POINTS, orderId);
}

async function reverseOrderPoints(orderId, refundAmount = null) {
  const orders = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!orders.length) return;
  const order = orders[0];

  const awarded = toNumber(order.points_awarded);
  const refund = refundAmount != null
    ? toNumber(refundAmount)
    : toNumber(order.refund_amount);
  const totalPrice = toNumber(order.total_price);

  let pointsToDeduct = 0;
  if (awarded > 0) {
    if (refund > 0 && totalPrice > 0 && refund < totalPrice) {
      pointsToDeduct = Math.floor(awarded * (refund / totalPrice));
    } else {
      pointsToDeduct = awarded;
    }
  }

  if (pointsToDeduct > 0) {
    await db.execute(
      'UPDATE users SET points = GREATEST(IFNULL(points, 0) - ?, 0) WHERE id = ?',
      [pointsToDeduct, order.user_id]
    );
    if (awarded > 0) {
      await db.execute(
        'UPDATE orders SET points_awarded = GREATEST(IFNULL(points_awarded, 0) - ?, 0) WHERE id = ?',
        [Math.min(pointsToDeduct, awarded), orderId]
      );
    }
    await addPointsRecord(order.user_id, '退费积分扣减', -pointsToDeduct, orderId);
  }

  const reviewRows = await db.query(
    'SELECT id, points FROM points_records WHERE user_id = ? AND order_id = ? AND type_name = ?',
    [order.user_id, orderId, '评价奖励']
  );
  if (reviewRows.length) {
    const reviewPoints = toNumber(reviewRows[0].points, REVIEW_BONUS_POINTS);
    if (reviewPoints > 0) {
      await db.execute(
        'UPDATE users SET points = GREATEST(IFNULL(points, 0) - ?, 0) WHERE id = ?',
        [reviewPoints, order.user_id]
      );
      await addPointsRecord(order.user_id, '退费评价积分扣减', -reviewPoints, orderId);
    }
  }
}

module.exports = {
  CONSUME_POINTS_PER_YUAN,
  REVIEW_BONUS_POINTS,
  getUserPointsSummary,
  awardOrderPoints,
  awardPartialCardSessionPoints,
  awardReviewPoints,
  reverseOrderPoints,
  ensurePointsRecordsTable
};
