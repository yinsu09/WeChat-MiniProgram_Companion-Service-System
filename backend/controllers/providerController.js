const Service = require('../models/Service');
const ServiceType = require('../models/ServiceType');
const User = require('../models/User');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const Review = require('../models/Review');
const db = require('../utils/db');
const { syncUserToServiceProvider, buildProviderProfile } = require('../utils/providerSync');
const { getServiceProviderIdByUserId, formatServiceDetail } = require('../utils/serviceHelper');
const { awardOrderPoints } = require('../utils/pointsHelper');
const { markOneServiceUsed } = require('../utils/refundHelper');
const { completeOneCardSession, enrichOrderWithCardInfo, isMultiCardOrder } = require('../utils/cardOrderHelper');
const {
  providerConfirmComplete,
  enrichCompletionFields,
  resetCompletionFlags
} = require('../utils/orderCompletionHelper');
const { validateServicePrice, getPriceRangeForProvider } = require('../utils/serviceTypePriceHelper');
const {
  getProviderRestInfo,
  setWorkMode,
  addRestPeriod,
  deleteRestPeriod,
  syncProviderAvailabilityAfterRest
} = require('../utils/providerRestHelper');
const { notifyPendingReviews } = require('../utils/notificationHelper');
const { recalculateProviderLevel } = require('../utils/providerLevel');
const {
  acceptGroupProvider,
  rejectGroupProvider,
  exitGroupProvider,
  getProviderGroupTours
} = require('../utils/groupTourHelper');

class ProviderController {
  static async register(req, res) {
    try {
      const { phone, password, code, name, avatar, id_card, service_area } = req.body;

      const user = await User.createProvider({
        phone,
        password,
        name,
        avatar,
        id_card,
        service_area
      });

      const profile = await buildProviderProfile(user.user.id);
      
      res.json({ code: 0, data: { token: user.token, user: profile || user.user } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async sendCode(req, res) {
    try {
      const { phone } = req.body;
      const code = Math.random().toString().slice(-6);
      res.json({ code: 0, data: { code } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async loginByPassword(req, res) {
    try {
      const { phone, password } = req.body;
      const result = await User.loginByPassword(phone, password, 'provider');
      await syncUserToServiceProvider(result.user.id);
      const profile = await buildProviderProfile(result.user.id);
      res.json({ code: 0, data: { token: result.token, user: profile || result.user } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async loginByPhone(req, res) {
    try {
      const { phone, code } = req.body;
      const result = await User.loginByPhone(phone, code, 'provider');
      await syncUserToServiceProvider(result.user.id);
      const profile = await buildProviderProfile(result.user.id);
      res.json({ code: 0, data: { token: result.token, user: profile || result.user } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getProfile(req, res) {
    try {
      const profile = await buildProviderProfile(req.userId);
      if (!profile) {
        return res.json({ code: -1, message: '服务人员不存在' });
      }
      const spId = await getServiceProviderIdByUserId(req.userId);
      const restInfo = spId ? await getProviderRestInfo(spId) : null;
      res.json({ code: 0, data: { ...profile, ...(restInfo || {}) } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getOrders(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      if (!spId) {
        return res.json({ code: 0, data: [] });
      }
      const orders = await Order.findDetailedByProviderId(spId);
      const normalized = await Promise.all(orders.map(async (order) => ({
        ...enrichCompletionFields(order),
        ...(await enrichOrderWithCardInfo(order)),
        hasReviewed: !!order.hasReviewed
      })));
      res.json({ code: 0, data: normalized });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateOrderStatus(req, res) {
    try {
      const { order_id, orderId, status, reason } = req.body;
      const id = order_id || orderId;
      const spId = await getServiceProviderIdByUserId(req.userId);
      if (!spId) {
        return res.json({ code: -1, message: '服务人员信息不存在' });
      }

      const statusNum = parseInt(status, 10);
      const order = await Order.findById(id);

      if (statusNum === 4) {
        const cardResult = await providerConfirmComplete(id, spId);
        const ongoing = await db.query(
          'SELECT id FROM orders WHERE provider_id = ? AND status = 3 LIMIT 1',
          [spId]
        );
        if (!ongoing.length) {
          await syncProviderAvailabilityAfterRest(spId);
        }

        let message = cardResult.message;
        if (!message) {
          if (cardResult.orderComplete) {
            message = isMultiCardOrder(order) ? '订单已全部完成' : '服务已完成';
          } else if (cardResult.remaining != null) {
            message = `本次服务已完成，剩余 ${cardResult.remaining} 次`;
          } else {
            message = '已确认完成，等待用户确认';
          }
        }

        return res.json({ code: 0, message, data: cardResult });
      }

      await Order.updateStatusForProvider(id, status, spId, { reason });

      if (statusNum === 3) {
        await resetCompletionFlags(id);
        await db.execute('UPDATE service_providers SET available = 0 WHERE id = ?', [spId]);
      } else if (statusNum === 5) {
        const ongoing = await db.query(
          'SELECT id FROM orders WHERE provider_id = ? AND status = 3 LIMIT 1',
          [spId]
        );
        if (!ongoing.length) {
          await syncProviderAvailabilityAfterRest(spId);
        }
      }

      res.json({ code: 0, message: '状态更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getServices(req, res) {
    try {
      const providerId = req.userId;
      console.log('getServices - providerId:', providerId);
      const user = await User.findById(providerId);
      console.log('getServices - user:', user);
      
      if (user) {
        // 获取用户保存的设置（ID数组）
        const savedServiceTypes = user.service_types ? JSON.parse(user.service_types) : [];
        const savedWeekdays = user.weekdays ? JSON.parse(user.weekdays) : [];
        const savedTimeSlots = user.time_slots ? JSON.parse(user.time_slots) : [];
        
        // 获取所有服务类型
        const allServiceTypes = await ServiceType.findAllWithDisabled();
        
        // 根据服务类型名称匹配图标
        const iconMap = {
          '陪诊': '🏥',
          '陪护': '🛏️',
          '陪玩': '🎮',
          '陪吃': '🍽️',
          '陪游': '🗺️',
          '陪学': '📚',
          '陪聊': '💬',
          '陪伴': '🤝',
          '陪练': '🎯',
          '陪医': '🏥',
          '陪同': '👥'
        };
        const defaultIcons = ['🎨', '🎵', '⚽', '🎭', '🎪', '🌟'];
        let defaultIndex = 0;
        
        // 构建前端期望的格式
        const serviceTypes = allServiceTypes.map(type => {
          // 获取服务类型名称（去掉可能的 "(已禁用)" 后缀）
          const typeName = type.status === 0 ? type.name.replace('(已禁用)', '').trim() : type.name;
          // 根据名称匹配图标，如果没有匹配则使用默认图标
          let icon = iconMap[typeName];
          if (!icon) {
            icon = defaultIcons[defaultIndex % defaultIcons.length];
            defaultIndex++;
          }
          return {
            id: type.id,
            name: type.status === 0 ? type.name + '(已禁用)' : type.name,
            icon: icon,
            selected: savedServiceTypes.includes(type.id)
          };
        });
        
        const weekdays = [
          { id: 1, name: '周一', selected: savedWeekdays.includes(1) },
          { id: 2, name: '周二', selected: savedWeekdays.includes(2) },
          { id: 3, name: '周三', selected: savedWeekdays.includes(3) },
          { id: 4, name: '周四', selected: savedWeekdays.includes(4) },
          { id: 5, name: '周五', selected: savedWeekdays.includes(5) },
          { id: 6, name: '周六', selected: savedWeekdays.includes(6) },
          { id: 0, name: '周日', selected: savedWeekdays.includes(0) }
        ];
        
        const timeSlots = [
          { id: 1, name: '09:00-12:00', selected: savedTimeSlots.includes(1) },
          { id: 2, name: '12:00-14:00', selected: savedTimeSlots.includes(2) },
          { id: 3, name: '14:00-17:00', selected: savedTimeSlots.includes(3) },
          { id: 4, name: '17:00-20:00', selected: savedTimeSlots.includes(4) }
        ];
        
        res.json({ code: 0, data: {
          serviceTypes,
          weekdays,
          timeSlots,
          serviceArea: user.service_area || ''
        }});
      } else {
        res.json({ code: 0, data: {} });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateServices(req, res) {
    try {
      const { service_types, weekdays, time_slots, service_area } = req.body;
      const providerId = req.userId;
      
      await User.updateProvider(providerId, {
        service_types: JSON.stringify(service_types || []),
        weekdays: JSON.stringify(weekdays || []),
        time_slots: JSON.stringify(time_slots || []),
        service_area: service_area || ''
      });

      await syncUserToServiceProvider(providerId);
      
      res.json({ code: 0, message: '更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getMyServices(req, res) {
    try {
      const providerId = req.userId;
      const spId = await getServiceProviderIdByUserId(providerId);
      const { id } = req.query;
      if (id) {
        const service = await Service.getById(id);
        if (!service || (service.provider_id !== spId && service.provider_id !== providerId)) {
          return res.json({ code: -1, message: '服务不存在' });
        }
        res.json({ code: 0, data: formatServiceDetail(service) });
      } else {
        const services = await Service.getByProvider(spId, providerId);
        const filtered = services.filter((s) => !String(s.name || '').startsWith('【组团】'));
        res.json({ code: 0, data: filtered });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async createService(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      await validateServicePrice(req.body.type_id, spId, req.body.base_price);
      const serviceId = await Service.create({ ...req.body, provider_id: spId });
      const service = await Service.getDetail(serviceId);
      res.json({ code: 0, data: service });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateService(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      const service = await Service.getById(req.body.id);
      if (!service || (service.provider_id !== spId && service.provider_id !== req.userId)) {
        return res.json({ code: -1, message: '服务不存在' });
      }
      const typeId = req.body.type_id != null ? req.body.type_id : service.type_id;
      const basePrice = req.body.base_price != null ? req.body.base_price : service.base_price;
      await validateServicePrice(typeId, spId, basePrice);
      await Service.update(req.body);
      const updated = await Service.getDetail(req.body.id);
      res.json({ code: 0, data: updated, message: '更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getPriceRange(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      const typeId = req.query.type_id;
      if (!typeId) {
        return res.json({ code: -1, message: '缺少服务类型' });
      }
      const range = await getPriceRangeForProvider(typeId, spId);
      res.json({ code: 0, data: range });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getWorkStatus(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      if (!spId) {
        return res.json({ code: -1, message: '服务人员信息不存在' });
      }
      const info = await getProviderRestInfo(spId);
      res.json({ code: 0, data: info });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateWorkMode(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      const { work_mode } = req.body;
      await setWorkMode(spId, work_mode);
      await syncProviderAvailabilityAfterRest(spId);
      const info = await getProviderRestInfo(spId);
      res.json({ code: 0, data: info, message: work_mode === 0 ? '已切换为休息' : '已切换为工作' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async addRestPeriod(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      const { start_time, end_time } = req.body;
      await addRestPeriod(spId, start_time, end_time);
      const info = await getProviderRestInfo(spId);
      res.json({ code: 0, data: info, message: '休息时段已添加' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async deleteRestPeriod(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      const { id } = req.params;
      await deleteRestPeriod(spId, id);
      await syncProviderAvailabilityAfterRest(spId);
      const info = await getProviderRestInfo(spId);
      res.json({ code: 0, data: info, message: '休息时段已删除' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateServiceStatus(req, res) {
    try {
      const { id, status } = req.body;
      const spId = await getServiceProviderIdByUserId(req.userId);
      const service = await Service.getById(id);
      if (!service || (service.provider_id !== spId && service.provider_id !== req.userId)) {
        return res.json({ code: -1, message: '服务不存在' });
      }
      await Service.updateStatus(id, status, spId);
      res.json({ code: 0, message: status === 1 ? '上架成功' : '下架成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async deleteService(req, res) {
    try {
      const { id } = req.query;
      const spId = await getServiceProviderIdByUserId(req.userId);
      const service = await Service.getById(id);
      if (!service || (service.provider_id !== spId && service.provider_id !== req.userId)) {
        return res.json({ code: -1, message: '服务不存在' });
      }
      if (service.name && String(service.name).startsWith('【组团】')) {
        return res.json({ code: -1, message: '组团游不可删除，请在「组团游」区域退出组团' });
      }
      await Service.delete(id);
      res.json({ code: 0, message: '删除成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getServiceTypes(req, res) {
    try {
      console.log('getServiceTypes 被调用');
      // 直接从数据库获取所有服务类型（包括禁用的）
      const types = await ServiceType.findAllWithDisabled();
      console.log('查询到的服务类型:', types);
      res.json({ code: 0, data: types });
    } catch (error) {
      console.error('getServiceTypes 错误:', error);
      res.json({ code: -1, message: error.message });
    }
  }

  static async getDashboard(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      if (!spId) {
        return res.json({ code: 0, data: { monthlyIncome: 0, totalOrders: 0, pendingOrders: 0, waitingServiceOrders: 0, inServiceOrders: 0, ongoingOrders: 0, unreadCount: 0, pendingOrder: null } });
      }

      const incomeRows = await db.query(
        `SELECT IFNULL(SUM(total_price), 0) AS income FROM orders
         WHERE provider_id = ? AND status = 4 AND MONTH(updated_at) = MONTH(NOW()) AND YEAR(updated_at) = YEAR(NOW())`,
        [spId]
      );
      const totalRows = await db.query('SELECT COUNT(*) AS count FROM orders WHERE provider_id = ?', [spId]);
      const pendingRows = await db.query('SELECT COUNT(*) AS count FROM orders WHERE provider_id = ? AND status = 1', [spId]);
      const waitingRows = await db.query('SELECT COUNT(*) AS count FROM orders WHERE provider_id = ? AND status = 2', [spId]);
      const inServiceRows = await db.query('SELECT COUNT(*) AS count FROM orders WHERE provider_id = ? AND status = 3', [spId]);
      const pendingOrderRows = await db.query(
        `SELECT o.*, s.name AS service_name, u.nickname AS user_name
         FROM orders o
         LEFT JOIN services s ON o.service_id = s.id
         LEFT JOIN users u ON o.user_id = u.id
         WHERE o.provider_id = ? AND o.status = 1
         ORDER BY o.created_at DESC LIMIT 1`,
        [spId]
      );
      const unreadCount = await Notification.getUnreadCount(req.userId);

      res.json({
        code: 0,
        data: {
          monthlyIncome: Number(incomeRows[0]?.income || 0),
          totalOrders: Number(totalRows[0]?.count || 0),
          pendingOrders: Number(pendingRows[0]?.count || 0),
          waitingServiceOrders: Number(waitingRows[0]?.count || 0),
          inServiceOrders: Number(inServiceRows[0]?.count || 0),
          ongoingOrders: Number(inServiceRows[0]?.count || 0),
          unreadCount,
          pendingOrder: pendingOrderRows[0] || null
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getIncome(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      if (!spId) {
        return res.json({ code: 0, data: { totalIncome: 0, currentStats: { orders: 0, income: 0, avgRating: '0.0' }, chartData: [], records: [] } });
      }

      const { period = 'month' } = req.query;
      let dateFilter = '';
      if (period === 'week') {
        dateFilter = 'AND o.updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
      } else if (period === 'month') {
        dateFilter = 'AND MONTH(o.updated_at) = MONTH(NOW()) AND YEAR(o.updated_at) = YEAR(NOW())';
      }

      const totalRows = await db.query(
        `SELECT IFNULL(SUM(o.total_price), 0) AS income, COUNT(*) AS orders
         FROM orders o WHERE o.provider_id = ? AND o.status = 4 ${dateFilter}`,
        [spId]
      );
      const allTimeRows = await db.query(
        `SELECT IFNULL(SUM(total_price), 0) AS income FROM orders WHERE provider_id = ? AND status = 4`,
        [spId]
      );
      const ratingRows = await db.query('SELECT avg_rating FROM service_providers WHERE id = ?', [spId]);

      const records = await db.query(
        `SELECT o.id, o.order_no, o.total_price AS amount, o.updated_at AS completed_at, s.name AS service_name
         FROM orders o
         LEFT JOIN services s ON o.service_id = s.id
         WHERE o.provider_id = ? AND o.status = 4 ${dateFilter}
         ORDER BY o.updated_at DESC LIMIT 50`,
        [spId]
      );

      let chartSql = '';
      if (period === 'week') {
        chartSql = `
          SELECT DATE(o.updated_at) AS label, IFNULL(SUM(o.total_price), 0) AS amount
          FROM orders o
          WHERE o.provider_id = ? AND o.status = 4 AND o.updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          GROUP BY DATE(o.updated_at) ORDER BY label ASC`;
      } else if (period === 'month') {
        chartSql = `
          SELECT DATE(o.updated_at) AS label, IFNULL(SUM(o.total_price), 0) AS amount
          FROM orders o
          WHERE o.provider_id = ? AND o.status = 4
            AND MONTH(o.updated_at) = MONTH(NOW()) AND YEAR(o.updated_at) = YEAR(NOW())
          GROUP BY DATE(o.updated_at) ORDER BY label ASC`;
      } else {
        chartSql = `
          SELECT DATE_FORMAT(o.updated_at, '%Y-%m') AS label, IFNULL(SUM(o.total_price), 0) AS amount
          FROM orders o
          WHERE o.provider_id = ? AND o.status = 4
          GROUP BY DATE_FORMAT(o.updated_at, '%Y-%m') ORDER BY label ASC LIMIT 12`;
      }

      const chartRows = await db.query(chartSql, [spId]);
      const maxAmount = Math.max(...chartRows.map((r) => parseFloat(r.amount) || 0), 1);
      const chartData = chartRows.map((row) => ({
        label: row.label instanceof Date ? row.label.toISOString().split('T')[0] : String(row.label),
        amount: parseFloat(row.amount || 0).toFixed(2),
        height: Math.round(((parseFloat(row.amount) || 0) / maxAmount) * 100)
      }));

      res.json({
        code: 0,
        data: {
          totalIncome: parseFloat(allTimeRows[0]?.income || 0).toFixed(2),
          currentStats: {
            orders: totalRows[0]?.orders || 0,
            income: parseFloat(totalRows[0]?.income || 0).toFixed(2),
            avgRating: parseFloat(ratingRows[0]?.avg_rating || 0).toFixed(1)
          },
          chartData,
          records: records.map((r) => ({
            ...r,
            amount: parseFloat(r.amount || 0).toFixed(2),
            completed_at: r.completed_at instanceof Date
              ? r.completed_at.toISOString().replace('T', ' ').slice(0, 16)
              : String(r.completed_at || '')
          }))
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateInfo(req, res) {
    try {
      const providerId = req.userId;
      const { nickname, avatar_url, bio, gender, real_name } = req.body;
      await User.updateProvider(providerId, {
        nickname,
        avatar_url,
        bio,
        gender,
        real_name
      });
      await syncUserToServiceProvider(providerId);
      const profile = await buildProviderProfile(providerId);
      res.json({ code: 0, data: profile, message: '更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getNotifications(req, res) {
    try {
      const userId = req.userId;
      const notifications = await Notification.getByUser(userId);
      const unreadCount = await Notification.getUnreadCount(userId);
      res.json({ code: 0, data: { list: notifications, unreadCount } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async markNotificationAsRead(req, res) {
    try {
      const { notificationId } = req.body;
      await Notification.markAsRead(notificationId, req.userId);
      res.json({ code: 0, message: '标记成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getReviews(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      if (!spId) {
        return res.json({ code: -1, message: '服务人员信息不存在' });
      }
      const toUserReviews = await Review.getUserReviewsOfProvider(spId);
      const fromProviderReviews = await Review.getReviewsWrittenByProvider(spId);
      res.json({ code: 0, data: { toUser: toUserReviews, fromProvider: fromProviderReviews } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getOrderDetail(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      const orderId = req.query.order_id || req.query.orderId;
      if (!orderId) {
        return res.json({ code: -1, message: '缺少订单ID' });
      }

      const rows = await db.query(
        `SELECT o.*, s.name AS service_name, u.nickname AS user_name
         FROM orders o
         LEFT JOIN services s ON o.service_id = s.id
         LEFT JOIN users u ON o.user_id = u.id
         WHERE o.id = ? AND o.provider_id = ?`,
        [orderId, spId]
      );

      if (!rows.length) {
        return res.json({ code: -1, message: '订单不存在' });
      }

      const order = enrichCompletionFields(rows[0]);
      res.json({ code: 0, data: order });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getGroupTours(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      if (!spId) {
        return res.json({ code: 0, data: [] });
      }
      const data = await getProviderGroupTours(spId);
      res.json({ code: 0, data });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async acceptGroupTour(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      if (!spId) {
        return res.json({ code: -1, message: '服务人员信息不存在' });
      }
      const data = await acceptGroupProvider(req.params.id, spId);
      res.json({ code: 0, data, message: '已接受组团游带团邀请' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async rejectGroupTour(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      if (!spId) {
        return res.json({ code: -1, message: '服务人员信息不存在' });
      }
      const data = await rejectGroupProvider(req.params.id, spId);
      res.json({ code: 0, data, message: '已拒绝组团游带团邀请' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async exitGroupTour(req, res) {
    try {
      const spId = await getServiceProviderIdByUserId(req.userId);
      if (!spId) {
        return res.json({ code: -1, message: '服务人员信息不存在' });
      }
      const data = await exitGroupProvider(req.params.id, spId);
      res.json({ code: 0, data, message: '已退出组团游' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = ProviderController;