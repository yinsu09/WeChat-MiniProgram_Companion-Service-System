const db = require('../utils/db');
const { recalculateProviderLevel } = require('../utils/providerLevel');
const { mapStatusFilter, mapDisplayStatus, statusText, needsAssign } = require('../utils/orderStatusHelper');
const { notifyProviderNewOrder } = require('../utils/orderNotifyHelper');
const { awardOrderPoints } = require('../utils/pointsHelper');
const { mapOrderCategoryClause, getOrderCategoryLabel } = require('../utils/orderCategoryHelper');
const { syncAllEndedGroupActivities } = require('../utils/groupTourHelper');
const { completeOneCardSession, isMultiCardOrder } = require('../utils/cardOrderHelper');

class AdminOrderController {
  static async getOrders(req, res) {
    try {
      await syncAllEndedGroupActivities();
      const { status, start_date, end_date, keyword, sort_by, sort_order, category } = req.query;
      let sql = `SELECT o.*, s.name as service_name, u.nickname as user_name, p.nickname as provider_name 
                 FROM orders o 
                 LEFT JOIN services s ON o.service_id = s.id 
                 LEFT JOIN users u ON o.user_id = u.id 
                 LEFT JOIN service_providers p ON o.provider_id = p.id 
                 WHERE 1=1`;
      const params = [];

      const categoryClause = mapOrderCategoryClause(category);
      if (categoryClause) {
        sql += ` AND ${categoryClause}`;
      }

      const statusClause = mapStatusFilter(status);
      if (statusClause) {
        sql += ` AND ${statusClause}`;
      } else if (status !== undefined && status !== '') {
        sql += ' AND o.status = ?';
        params.push(parseInt(status, 10));
      }

      if (start_date) {
        sql += ' AND DATE(o.created_at) >= ?';
        params.push(start_date);
      }
      if (end_date) {
        sql += ' AND DATE(o.created_at) <= ?';
        params.push(end_date);
      }
      if (keyword) {
        sql += ' AND (o.order_no LIKE ? OR u.nickname LIKE ? OR s.name LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }

      if (sort_by) {
        const sortFields = {
          price: 'total_price',
          create_time: 'created_at'
        };
        const field = sortFields[sort_by] || 'created_at';
        sql += ` ORDER BY ${field} ${sort_order === 'asc' ? 'ASC' : 'DESC'}`;
      } else {
        sql += ' ORDER BY o.created_at DESC';
      }

      const orders = await db.query(sql, params);
      const data = orders.map((order) => {
        const displayStatus = mapDisplayStatus(order);
        return {
          ...order,
          category: order.group_activity_id ? 'group' : (Number(order.is_custom) === 1 ? 'custom' : 'regular'),
          category_label: getOrderCategoryLabel(order),
          display_status: displayStatus,
          status_text: statusText(displayStatus),
          needs_assign: needsAssign(order)
        };
      });
      res.json({ code: 0, data });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getOrder(req, res) {
    try {
      const { id } = req.params;
      const sql = `SELECT o.*, s.name as service_name, s.description as service_desc, s.cover_image as service_image,
                          s.service_area, s.type_id, st.name as type_name,
                          u.nickname as user_name, u.phone as user_phone,
                          p.nickname as provider_name, p.phone as provider_phone
                   FROM orders o 
                   LEFT JOIN services s ON o.service_id = s.id 
                   LEFT JOIN service_types st ON s.type_id = st.id
                   LEFT JOIN users u ON o.user_id = u.id 
                   LEFT JOIN service_providers p ON o.provider_id = p.id 
                   WHERE o.id = ?`;
      const orders = await db.query(sql, [id]);
      if (orders.length > 0) {
        const order = orders[0];
        res.json({
          code: 0,
          data: {
            ...order,
            category: order.group_activity_id ? 'group' : (Number(order.is_custom) === 1 ? 'custom' : 'regular'),
            category_label: getOrderCategoryLabel(order),
            display_status: mapDisplayStatus(order),
            status_text: statusText(mapDisplayStatus(order)),
            needs_assign: needsAssign(order),
            create_time: order.created_at,
            service_type: order.type_name || '',
            total_amount: order.total_price,
            service_price: order.total_price,
            duration_price: 0
          }
        });
      } else {
        res.json({ code: -1, message: '订单不存在' });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async cancelOrder(req, res) {
    try {
      const { id } = req.params;
      await db.execute('UPDATE orders SET status = 5 WHERE id = ?', [id]);
      res.json({ code: 0, message: '订单已取消' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async assignProvider(req, res) {
    try {
      const { id } = req.params;
      const { provider_id } = req.body;

      if (!provider_id) {
        return res.json({ code: -1, message: '请选择服务人员' });
      }

      const orders = await db.query(
        `SELECT o.*, s.type_id, s.service_area, st.name AS type_name, s.name AS service_name, o.order_no
         FROM orders o
         LEFT JOIN services s ON o.service_id = s.id
         LEFT JOIN service_types st ON s.type_id = st.id
         WHERE o.id = ?`,
        [id]
      );
      if (!orders.length) {
        return res.json({ code: -1, message: '订单不存在' });
      }

      const order = orders[0];
      const providers = await db.query(
        `SELECT sp.id FROM service_providers sp
         INNER JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
         WHERE sp.id = ? AND sp.status = 1 AND u.status = 1`,
        [provider_id]
      );
      if (!providers.length) {
        return res.json({ code: -1, message: '所选服务人员不可用' });
      }

      if (order.type_id) {
        const matched = await db.query(
          `SELECT sp.id FROM service_providers sp
           INNER JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
           WHERE sp.id = ? AND JSON_CONTAINS(u.service_types, ?)`,
          [provider_id, JSON.stringify(order.type_id)]
        );
        if (!matched.length) {
          return res.json({ code: -1, message: '该服务人员不提供此类服务' });
        }
      }

      await db.execute('UPDATE orders SET provider_id = ?, status = 1, assign_type = 0 WHERE id = ?', [provider_id, id]);
      await notifyProviderNewOrder(provider_id, order.order_no, order.service_name);
      res.json({ code: 0, message: '指派成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateOrderStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const statusNum = Number(status);
      const orders = await db.query('SELECT * FROM orders WHERE id = ?', [id]);
      if (!orders.length) {
        return res.json({ code: -1, message: '订单不存在' });
      }
      const order = orders[0];

      if (statusNum === 4 && isMultiCardOrder(order)) {
        const cardResult = await completeOneCardSession(id, order.provider_id);
        if (cardResult.orderComplete) {
          await awardOrderPoints(id);
        }
        if (order.provider_id && cardResult.orderComplete) {
          await recalculateProviderLevel(order.provider_id);
        }
        return res.json({
          code: 0,
          message: cardResult.orderComplete
            ? '订单已全部完成'
            : `本次服务已完成，剩余 ${cardResult.remaining} 次`,
          data: cardResult
        });
      }

      await db.execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
      if (statusNum === 4) {
        await awardOrderPoints(id);
      }
      if (orders[0]?.provider_id && statusNum === 4) {
        await recalculateProviderLevel(orders[0].provider_id);
      }
      res.json({ code: 0, message: '状态已更新' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = AdminOrderController;
