const Review = require('../models/Review');
const Order = require('../models/Order');
const { awardReviewPoints } = require('../utils/pointsHelper');
const { getServiceProviderIdByUserId } = require('../utils/serviceHelper');
const { notifyReviewReceived, getProviderUserId } = require('../utils/notificationHelper');
const { recalculateProviderLevel } = require('../utils/providerLevel');

class ReviewController {
  static async createReview(req, res) {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.json({ code: 1, message: '请先登录' });
      }

      const {
        order_id,
        provider_id,
        service_id,
        overall_rating,
        professional_rating,
        attitude_rating,
        punctual_rating,
        content,
        images,
        is_anonymous
      } = req.body;

      if (!order_id || !overall_rating) {
        return res.json({ code: 1, message: '缺少必要参数' });
      }

      const order = await Order.findById(order_id);
      if (!order || Number(order.user_id) !== Number(userId)) {
        return res.json({ code: 1, message: '订单不存在或无权限' });
      }
      if (Number(order.status) !== 4) {
        return res.json({ code: 1, message: '订单未完成，暂不可评价' });
      }
      if (await Review.exists(order_id, 'user')) {
        return res.json({ code: 1, message: '该订单已评价' });
      }

      const finalProviderId = provider_id || order.provider_id;
      const finalServiceId = service_id || order.service_id;

      const review = await Review.createUserReview({
        order_id,
        user_id: userId,
        provider_id: finalProviderId,
        service_id: finalServiceId,
        overall_rating,
        professional_rating: professional_rating || overall_rating,
        attitude_rating: attitude_rating || overall_rating,
        punctual_rating: punctual_rating || overall_rating,
        content,
        images: JSON.stringify(images || []),
        is_anonymous: is_anonymous ? 1 : 0
      });

      if (finalProviderId) {
        await Review.updateProviderStats(finalProviderId);
        await recalculateProviderLevel(finalProviderId);
        const providerUserId = await getProviderUserId(finalProviderId);
        await notifyReviewReceived(providerUserId, order.order_no, '用户');
      }
      await awardReviewPoints(userId, order_id);

      res.json({ code: 0, message: '评价成功', data: review });
    } catch (error) {
      console.error('Create review error:', error);
      res.json({ code: 1, message: error.message || '评价失败' });
    }
  }

  static async createProviderReview(req, res) {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.json({ code: 1, message: '请先登录' });
      }

      const spId = await getServiceProviderIdByUserId(userId);
      const {
        order_id,
        attitude_rating,
        cooperation_rating,
        communication_rating,
        content,
        behavior_tags
      } = req.body;

      if (!order_id || !attitude_rating || !cooperation_rating || !communication_rating) {
        return res.json({ code: 1, message: '请完成全部评分' });
      }

      const order = await Order.findById(order_id);
      if (!order || Number(order.provider_id) !== Number(spId)) {
        return res.json({ code: 1, message: '订单不存在或无权限' });
      }
      if (Number(order.status) !== 4) {
        return res.json({ code: 1, message: '订单未完成，暂不可评价' });
      }
      if (await Review.exists(order_id, 'provider')) {
        return res.json({ code: 1, message: '该订单已评价过用户' });
      }

      const review = await Review.createProviderReview({
        order_id,
        user_id: order.user_id,
        provider_id: spId,
        service_id: order.service_id,
        attitude_rating,
        cooperation_rating,
        communication_rating,
        content,
        behavior_tags: Review.encodeBehaviorTags(behavior_tags)
      });

      await notifyReviewReceived(order.user_id, order.order_no, '服务人员');

      res.json({ code: 0, message: '评价成功', data: review });
    } catch (error) {
      console.error('Create provider review error:', error);
      res.json({ code: 1, message: error.message || '评价失败' });
    }
  }

  static async getServiceProviderReviews(req, res) {
    try {
      const { providerId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const reviews = await Review.getUserReviewsOfProvider(providerId, page, limit, true);
      const stats = await Review.getProviderStats(providerId);

      res.json({
        code: 0,
        data: { reviews, stats }
      });
    } catch (error) {
      console.error('Get provider reviews error:', error);
      res.json({
        code: 0,
        data: {
          reviews: [],
          stats: { avgRating: '0', totalReviews: 0, goodRate: 0 }
        }
      });
    }
  }

  static async getUserReviews(req, res) {
    try {
      const userId = req.userId;
      const { page = 1, limit = 50 } = req.query;

      if (!userId) {
        return res.json({ code: 1, message: '请先登录', data: [] });
      }

      const reviews = await Review.getReviewsWrittenByUser(userId, page, limit);
      res.json({ code: 0, data: reviews });
    } catch (error) {
      console.error('Get user reviews error:', error);
      res.json({ code: 0, data: [] });
    }
  }

  static async getOrderReview(req, res) {
    try {
      const { orderId } = req.params;
      const { type } = req.query;
      const review = await Review.getByOrderId(orderId, type || null);
      res.json({ code: 0, data: review });
    } catch (error) {
      console.error('Get order review error:', error);
      res.json({ code: 0, data: null });
    }
  }

  static async getFromProviderReviews(req, res) {
    try {
      const userId = req.userId;
      const { page = 1, limit = 50 } = req.query;

      if (!userId) {
        return res.json({ code: 1, message: '请先登录', data: [] });
      }

      const reviews = await Review.getReviewsForUserFromProvider(userId, page, limit);
      res.json({ code: 0, data: reviews });
    } catch (error) {
      console.error('Get from provider reviews error:', error);
      res.json({ code: 0, data: [] });
    }
  }
}

module.exports = ReviewController;
