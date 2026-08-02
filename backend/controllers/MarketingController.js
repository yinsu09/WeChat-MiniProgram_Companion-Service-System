const db = require('../utils/db');
const {
  countGroupParticipants,
  hasUserJoinedGroup,
  createGroupOrder
} = require('../utils/groupOrderHelper');
const {
  enrichGroupActivity,
  syncAllEndedGroupActivities,
  syncEndedGroupOrders,
  buildLifecycleMeta,
  isGroupActivityEnded
} = require('../utils/groupTourHelper');

class MarketingController {
  static async getGroupActivities(req, res) {
    try {
      await syncAllEndedGroupActivities();
      const activities = await db.query(
        `SELECT * FROM coupons WHERE type = 3 AND status = 1 ORDER BY valid_start ASC`
      );

      const result = await Promise.all(activities.map(async (activity) => {
        const currentPeople = await countGroupParticipants(activity.id);
        const maxPeople = activity.total_count || 100;
        const lifecycle = buildLifecycleMeta(activity, currentPeople);
        const statusStr = lifecycle.activity_status;

        const validStartStr = activity.valid_start instanceof Date
          ? activity.valid_start.toISOString().replace('T', ' ')
          : String(activity.valid_start || '');
        const enriched = await enrichGroupActivity(activity);

        return {
          id: activity.id,
          name: activity.name,
          description: activity.description || '',
          location: activity.location || '',
          start_time: validStartStr.split(' ')[0] || '',
          start_hour: validStartStr.split(' ')[1]?.slice(0, 5) || '',
          max_people: maxPeople,
          min_people: parseInt(activity.min_amount, 10) || 0,
          current_people: currentPeople,
          price: parseFloat(activity.discount_value) || 0,
          status: statusStr,
          group_success: !!activity.group_success,
          activity_ended: lifecycle.activity_ended,
          viewOnly: lifecycle.viewOnly,
          lifecycle_text: lifecycle.lifecycle_text,
          progress: maxPeople > 0 ? Math.round((currentPeople / maxPeople) * 100) : 0,
          provider_display: enriched.provider_display,
          has_provider: enriched.has_provider
        };
      }));

      res.json({ code: 0, data: result.filter((item) => item.status !== 'inactive') });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getGroupActivity(req, res) {
    try {
      const { id } = req.params;
      await syncEndedGroupOrders(id);
      const activities = await db.query('SELECT * FROM coupons WHERE id = ? AND type = 3', [id]);
      if (!activities.length) {
        return res.json({ code: -1, message: '组团活动不存在' });
      }

      const activity = activities[0];
      const currentPeople = await countGroupParticipants(activity.id);
      const maxPeople = activity.total_count || 100;
      const lifecycle = buildLifecycleMeta(activity, currentPeople);
      const statusStr = lifecycle.activity_status;

      const validStartStr = activity.valid_start instanceof Date
        ? activity.valid_start.toISOString().replace('T', ' ')
        : String(activity.valid_start || '');
      const validEndStr = activity.valid_end instanceof Date
        ? activity.valid_end.toISOString().replace('T', ' ')
        : String(activity.valid_end || '');

      let joined = false;
      if (req.userId) {
        joined = await hasUserJoinedGroup(req.userId, id);
      }
      const enriched = await enrichGroupActivity(activity);

      res.json({
        code: 0,
        data: {
          id: activity.id,
          name: activity.name,
          description: activity.description || '',
          location: activity.location || '',
          start_time: validStartStr.split(' ')[0] || '',
          start_hour: validStartStr.split(' ')[1]?.slice(0, 5) || '',
          end_time: validEndStr,
          max_people: maxPeople,
          min_people: parseInt(activity.min_amount, 10) || 0,
          current_people: currentPeople,
          price: parseFloat(activity.discount_value) || 0,
          status: statusStr,
          group_success: !!activity.group_success,
          activity_ended: lifecycle.activity_ended,
          viewOnly: lifecycle.viewOnly,
          lifecycle_text: lifecycle.lifecycle_text,
          progress: maxPeople > 0 ? Math.round((currentPeople / maxPeople) * 100) : 0,
          provider_id: enriched.provider_id || null,
          provider_display: enriched.provider_display,
          provider_name: enriched.provider_name,
          has_provider: enriched.has_provider,
          joined
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async joinGroupActivity(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;

      const activities = await db.query(
        'SELECT * FROM coupons WHERE id = ? AND type = 3 AND status = 1',
        [id]
      );
      if (!activities.length) {
        return res.json({ code: -1, message: '组团活动不存在' });
      }

      const activity = activities[0];
      if (isGroupActivityEnded(activity)) {
        return res.json({ code: -1, message: '活动已结束' });
      }
      if (new Date(activity.valid_start) > new Date()) {
        return res.json({ code: -1, message: '活动尚未开始' });
      }

      if (await hasUserJoinedGroup(userId, id)) {
        return res.json({ code: -1, message: '您已报名该活动' });
      }

      const currentPeople = await countGroupParticipants(id);
      const maxPeople = activity.total_count || 100;
      if (currentPeople >= maxPeople) {
        return res.json({ code: -1, message: '活动名额已满' });
      }

      const { orderId, orderNo } = await createGroupOrder(userId, activity);
      const newCount = currentPeople + 1;
      if (newCount >= maxPeople) {
        await db.execute('UPDATE coupons SET group_success = 1 WHERE id = ?', [id]);
        await syncEndedGroupOrders(id);
      }

      res.json({
        code: 0,
        data: { order_id: orderId, order_no: orderNo },
        message: newCount >= maxPeople ? '报名成功，已达最大人数，组团成功！' : '报名成功，可在我的订单中查看'
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = MarketingController;
