const db = require('./db');
const Notification = require('../models/Notification');

async function hasReceivedActivityGift(userId, activityId) {
  const rows = await db.query(
    'SELECT id FROM user_newuser_gift_log WHERE user_id = ? AND activity_id = ? LIMIT 1',
    [userId, activityId]
  );
  return rows.length > 0;
}

async function markActivityGiftReceived(userId, activityId) {
  await db.execute(
    'INSERT IGNORE INTO user_newuser_gift_log (user_id, activity_id, created_at) VALUES (?, ?, NOW())',
    [userId, activityId]
  );
}

function parseGiftQuantity(gift) {
  const qty = parseInt(gift.quantity ?? gift.count ?? gift.limit ?? 1, 10);
  return Math.max(qty, 1);
}

function resolveCouponTypeName(gift) {
  const isDiscount = gift.couponType === 2 || gift.couponType === 'discount'
    || String(gift.name || '').includes('折');
  return isDiscount ? '折扣券' : '满减券';
}

function normalizeExpireTime(validEnd) {
  if (!validEnd) return null;

  const toDatePart = (input) => {
    if (input instanceof Date && !Number.isNaN(input.getTime())) {
      const y = input.getFullYear();
      const m = String(input.getMonth() + 1).padStart(2, '0');
      const d = String(input.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const raw = String(input).trim();
    const isoPart = raw.split('T')[0].split(' ')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoPart)) return isoPart;
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return '';
  };

  const datePart = toDatePart(validEnd);
  if (!datePart) return null;
  return `${datePart} 23:59:59`;
}

function isActivityActive(activity) {
  const now = new Date();
  if (activity.valid_start) {
    const start = new Date(activity.valid_start);
    if (!Number.isNaN(start.getTime()) && start > now) return false;
  }
  if (activity.valid_end) {
    const end = new Date(activity.valid_end);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (end < now) return false;
    }
  }
  return true;
}

async function insertUserCoupon(userId, gift, activity, expireTime) {
  const amount = parseFloat(gift.amount) || 0;
  await db.execute(
    `INSERT INTO user_coupons (
      user_id, coupon_id, name, type_name, value, min_amount, expire_time, status, is_new, source_activity_id, created_at
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, 1, 1, ?, NOW())`,
    [
      userId,
      gift.name || activity.name,
      resolveCouponTypeName(gift),
      amount,
      parseFloat(gift.min_amount) || 0,
      expireTime,
      activity.id
    ]
  );
}

async function insertUserPointsCoupon(userId, gift, activity, expireTime) {
  const points = parseInt(gift.amount, 10) || 0;
  const name = gift.name || `${points}积分券`;
  await db.execute(
    `INSERT INTO user_coupons (
      user_id, coupon_id, name, type_name, value, min_amount, expire_time, status, is_new, source_activity_id, created_at
    ) VALUES (?, NULL, ?, '积分券', ?, 0, ?, 1, 1, ?, NOW())`,
    [userId, name, points, expireTime, activity.id]
  );
}

async function grantActivityGifts(userId, activity) {
  let gifts = [];
  try {
    gifts = JSON.parse(activity.service_types || '[]');
  } catch (_) {
    gifts = [];
  }
  if (!gifts.length) return { couponCount: 0, points: 0, summaries: [] };

  let couponCount = 0;
  const summaries = [];
  const expireTime = normalizeExpireTime(activity.valid_end);

  for (const gift of gifts) {
    const giftType = gift.type || 'coupon';

    if (giftType === 'gift') {
      const points = parseInt(gift.amount, 10) || 0;
      if (points <= 0) continue;
      const quantity = parseGiftQuantity(gift);
      for (let i = 0; i < quantity; i += 1) {
        await insertUserPointsCoupon(userId, gift, activity, expireTime);
        couponCount += 1;
      }
      summaries.push(`${gift.name || `${points}积分券`}×${quantity}`);
      continue;
    }

    if (giftType !== 'coupon') {
      continue;
    }

    const amount = parseFloat(gift.amount) || 0;
    if (amount <= 0 && !gift.name) continue;

    const quantity = parseGiftQuantity(gift);
    for (let i = 0; i < quantity; i += 1) {
      await insertUserCoupon(userId, gift, activity, expireTime);
      couponCount += 1;
    }
    summaries.push(`${gift.name || '优惠券'}×${quantity}`);
  }

  return { couponCount, points: 0, summaries };
}

/**
 * 为未领取过的新手礼包活动发放奖励（含历史注册用户补发）
 * @returns {{ granted: boolean, details: Array }}
 */
async function tryGrantNewUserGifts(userId, role = 1) {
  if (Number(role) !== 1 || !userId) {
    return { granted: false, details: [] };
  }

  const activities = await db.query(
    `SELECT * FROM coupons WHERE type = 1 AND status = 1 ORDER BY id ASC`
  );

  const details = [];
  let grantedAny = false;

  for (const activity of activities) {
    if (!isActivityActive(activity)) {
      continue;
    }
    if (await hasReceivedActivityGift(userId, activity.id)) {
      continue;
    }

    const result = await grantActivityGifts(userId, activity);
    if (result.couponCount === 0 && result.points === 0) {
      continue;
    }

    await markActivityGiftReceived(userId, activity.id);
    grantedAny = true;

    const summaryText = result.summaries.join('、') || activity.name;
    await Notification.create({
      user_id: userId,
      title: '新人礼包到账',
      content: `恭喜获得「${activity.name}」：${summaryText}，已放入您的优惠券，快去兑换使用吧！`,
      type: 1
    });

    details.push({
      activity_id: activity.id,
      activity_name: activity.name,
      coupon_count: result.couponCount,
      points: result.points
    });
  }

  return { granted: grantedAny, details };
}

/** @deprecated 使用 tryGrantNewUserGifts */
async function grantNewUserCoupons(userId) {
  return tryGrantNewUserGifts(userId, 1);
}

module.exports = {
  grantNewUserCoupons,
  tryGrantNewUserGifts
};
