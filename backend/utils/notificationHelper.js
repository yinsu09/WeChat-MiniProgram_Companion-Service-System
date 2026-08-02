const db = require('./db');
const Notification = require('../models/Notification');
const Review = require('../models/Review');

async function getProviderUserId(spId) {
  const rows = await db.query(
    `SELECT u.id FROM users u
     INNER JOIN service_providers sp ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
     WHERE sp.id = ? LIMIT 1`,
    [spId]
  );
  return rows[0]?.id || null;
}

async function notifyProviderNewOrder(providerId, orderNo, serviceName) {
  if (!providerId) return;
  const userId = await getProviderUserId(providerId);
  if (!userId) return;
  await Notification.create({
    user_id: userId,
    title: '新订单通知',
    content: `您有新的订单 ${orderNo}（${serviceName || '服务'}），请及时处理。`,
    type: 2
  });
}

async function notifyReviewReceived(targetUserId, orderNo, reviewerLabel) {
  if (!targetUserId) return;
  await Notification.create({
    user_id: targetUserId,
    title: '收到新评价',
    content: `${reviewerLabel}对订单 ${orderNo} 提交了评价，点击查看详情。`,
    type: 3
  });
}

async function notifyPendingReviews(order) {
  if (!order || Number(order.status) !== 4) return;

  const orderNo = order.order_no || order.id;
  const userReviewed = await Review.exists(order.id, 'user');
  const providerReviewed = await Review.exists(order.id, 'provider');

  if (!userReviewed && order.user_id) {
    await Notification.create({
      user_id: order.user_id,
      title: '待完成评价',
      content: `订单 ${orderNo} 已完成，请对服务人员进行评价。`,
      type: 1
    });
  }

  if (!providerReviewed && order.provider_id) {
    const providerUserId = await getProviderUserId(order.provider_id);
    if (providerUserId) {
      await Notification.create({
        user_id: providerUserId,
        title: '待完成评价',
        content: `订单 ${orderNo} 已完成，请对用户进行评价。`,
        type: 1
      });
    }
  }
}

module.exports = {
  getProviderUserId,
  notifyProviderNewOrder,
  notifyReviewReceived,
  notifyPendingReviews
};
