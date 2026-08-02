const db = require('../utils/db');
const { countGroupParticipants } = require('../utils/groupOrderHelper');
const {
  enrichGroupActivity,
  inviteGroupProvider: sendGroupProviderInvite,
  syncAllEndedGroupActivities,
  syncEndedGroupOrders,
  assertGroupActivityEditable,
  buildLifecycleMeta,
} = require('../utils/groupTourHelper');

class AdminMarketingController {
  static async getStats(req, res) {
    try {
      const couponResult = await db.query('SELECT COUNT(*) as count FROM coupons WHERE (type = 0 OR type IS NULL OR type = 2)');
      const discountResult = await db.query('SELECT COUNT(*) as count FROM discounts');
      const newUserResult = await db.query('SELECT COUNT(*) as count FROM coupons WHERE type = 1');
      const groupResult = await db.query('SELECT COUNT(*) as count FROM coupons WHERE type = 3');
      const newUsersCountResult = await db.query('SELECT COUNT(*) as count FROM users WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)');

      const totalSavedResult = await db.query(`
        SELECT IFNULL(SUM(COALESCE(o.discount_amount, 0) + COALESCE(o.promotion_discount, 0)), 0) as total
        FROM orders o
        WHERE o.status IN (2, 3, 4)
      `);

      const usedCouponsResult = await db.query(`
        SELECT COUNT(*) as count FROM user_coupons uc
        LEFT JOIN coupons c ON uc.coupon_id = c.id
        WHERE uc.status = 2 AND (uc.type_name IS NULL OR uc.type_name != '组团游')
          AND (c.id IS NULL OR c.type != 3)
      `);
      const totalCouponsResult = await db.query(`
        SELECT COUNT(*) as count FROM user_coupons uc
        LEFT JOIN coupons c ON uc.coupon_id = c.id
        WHERE (uc.type_name IS NULL OR uc.type_name != '组团游')
          AND (c.id IS NULL OR c.type != 3)
      `);
      const issuedCouponResult = await db.query(`
        SELECT COUNT(*) as count FROM user_coupons uc
        LEFT JOIN coupons c ON uc.coupon_id = c.id
        WHERE uc.status = 1 AND (uc.type_name IS NULL OR uc.type_name != '组团游')
          AND (c.id IS NULL OR c.type != 3)
          AND (uc.expire_time IS NULL OR uc.expire_time > NOW())
      `);
      const conversionRate = totalCouponsResult[0].count > 0
        ? Math.round((usedCouponsResult[0].count / totalCouponsResult[0].count) * 100 * 10) / 10
        : 0;

      const thisWeekOrders = await db.query(`
        SELECT COUNT(*) as count FROM orders
        WHERE status = 1 AND YEARWEEK(created_at) = YEARWEEK(NOW())
      `);
      const lastWeekOrders = await db.query(`
        SELECT COUNT(*) as count FROM orders
        WHERE status = 1 AND YEARWEEK(created_at) = YEARWEEK(NOW() - INTERVAL 1 WEEK)
      `);
      let increaseRate = 0;
      if (lastWeekOrders[0].count > 0) {
        increaseRate = Math.round(((thisWeekOrders[0].count - lastWeekOrders[0].count) / lastWeekOrders[0].count) * 100 * 10) / 10;
      } else if (thisWeekOrders[0].count > 0) {
        increaseRate = 100;
      }

      res.json({
        code: 0,
        data: {
          couponCount: issuedCouponResult[0].count,
          couponTemplateCount: couponResult[0].count,
          discountCount: discountResult[0].count,
          newUserCount: newUserResult[0].count,
          groupCount: groupResult[0].count,
          totalSaved: parseFloat(totalSavedResult[0].total) || 0,
          increaseRate: increaseRate,
          newUsers: newUsersCountResult[0].count,
          conversionRate: conversionRate
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getActiveActivities(req, res) {
    try {
      const now = new Date();
      const nowStr = now.toISOString().split('T')[0];
      
      const activities = await db.query(`
        SELECT c.id, c.name, c.type, c.valid_start, c.valid_end, c.total_count
        FROM coupons c
        WHERE c.status = 1 AND c.valid_start <= ? AND c.valid_end >= ?
        ORDER BY c.valid_end DESC
      `, [nowStr, nowStr]);
      
      const result = [];
      
      for (let i = 0; i < activities.length; i++) {
        const activity = activities[i];
        let participants = 0;
        
        try {
          if (activity.type === 3) {
            participants = await countGroupParticipants(activity.id);
          } else {
            const peopleResult = await db.query(
              `SELECT COUNT(*) as count FROM user_coupons uc
               LEFT JOIN coupons c ON uc.coupon_id = c.id
               WHERE uc.coupon_id = ? AND (c.type IS NULL OR c.type != 3)`,
              [activity.id]
            );
            participants = peopleResult[0]?.count ? parseInt(peopleResult[0].count, 10) : 0;
          }
        } catch (e) {
          participants = 0;
        }
        
        const maxPeople = activity.total_count ? parseInt(activity.total_count) : 100;
        const progress = maxPeople > 0 ? Math.round((participants / maxPeople) * 100) : 0;
        
        let typeStr = 'coupon';
        if (activity.type === 1) {
          typeStr = 'new_user';
        } else if (activity.type === 3) {
          typeStr = 'group';
        }
        
        const validStartStr = activity.valid_start instanceof Date ? activity.valid_start.toISOString().split('T')[0] : 
                            typeof activity.valid_start === 'string' ? activity.valid_start.split(' ')[0] : '';
        const validEndStr = activity.valid_end instanceof Date ? activity.valid_end.toISOString().split('T')[0] : 
                          typeof activity.valid_end === 'string' ? activity.valid_end.split(' ')[0] : '';
        
        result.push({
          id: activity.id,
          name: activity.name,
          type: typeStr,
          participants: participants,
          progress: progress,
          status: 'active',
          start_time: validStartStr,
          end_time: validEndStr
        });
      }
      
      res.json({ code: 0, data: result });
    } catch (error) {
      console.error('getActiveActivities error:', error);
      res.json({ code: -1, message: error.message });
    }
  }

  static async getCoupons(req, res) {
    try {
      const { status, keyword } = req.query;
      let sql = 'SELECT * FROM coupons WHERE (type = 0 OR type IS NULL)';
      const params = [];

      if (status !== undefined && status !== '') {
        if (status === 'active') {
          sql += ' AND valid_start <= NOW() AND valid_end >= NOW()';
        } else if (status === 'inactive') {
          sql += ' AND valid_start > NOW()';
        } else if (status === 'expired') {
          sql += ' AND valid_end < NOW()';
        }
      }
      if (keyword) {
        sql += ' AND name LIKE ?';
        params.push(`%${keyword}%`);
      }

      sql += ' ORDER BY created_at DESC';

      const coupons = await db.query(sql, params);
      res.json({ code: 0, data: coupons });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getCoupon(req, res) {
    try {
      const { id } = req.params;
      const coupons = await db.query('SELECT * FROM coupons WHERE id = ? AND (type = 0 OR type IS NULL)', [id]);
      if (coupons.length > 0) {
        res.json({ code: 0, data: coupons[0] });
      } else {
        res.json({ code: -1, message: '优惠券不存在' });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async createCoupon(req, res) {
    try {
      const { name, type = 0, discount_value, min_amount = 0, valid_start, valid_end, total_count = 100, service_types = '[]', user_limit = 1, status = 1, description = '', points_cost = 0 } = req.body;
      const result = await db.execute(
        'INSERT INTO coupons (name, type, discount_value, min_amount, valid_start, valid_end, total_count, service_types, user_limit, status, description, points_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, type, discount_value, min_amount, valid_start, valid_end, total_count, service_types, user_limit, status, description, points_cost]
      );
      res.json({ code: 0, data: { id: result.insertId }, message: '创建成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateCoupon(req, res) {
    try {
      console.log('updateCoupon received:', req.body);
      const { id } = req.params;
      const { name, type, discount_value, min_amount, valid_start, valid_end, total_count, status, service_types, user_limit, description, points_cost } = req.body;
      const updates = [];
      const params = [];

      if (name) { updates.push('name = ?'); params.push(name); }
      if (type !== undefined) { updates.push('type = ?'); params.push(type); }
      if (discount_value) { updates.push('discount_value = ?'); params.push(discount_value); }
      if (min_amount !== undefined) { updates.push('min_amount = ?'); params.push(min_amount); }
      if (valid_start) { updates.push('valid_start = ?'); params.push(valid_start); }
      if (valid_end) { updates.push('valid_end = ?'); params.push(valid_end); }
      if (total_count) { updates.push('total_count = ?'); params.push(total_count); }
      if (status !== undefined) { updates.push('status = ?'); params.push(parseInt(status)); }
      if (service_types !== undefined) { updates.push('service_types = ?'); params.push(service_types); }
      if (user_limit !== undefined) { updates.push('user_limit = ?'); params.push(user_limit); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (points_cost !== undefined) { updates.push('points_cost = ?'); params.push(parseInt(points_cost, 10) || 0); }

      console.log('Updates:', updates);
      console.log('Params:', params);

      if (updates.length === 0) {
        return res.json({ code: -1, message: '没有更新内容' });
      }

      params.push(id);
      await db.execute(`UPDATE coupons SET ${updates.join(', ')} WHERE id = ?`, params);
      res.json({ code: 0, message: '更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async deleteCoupon(req, res) {
    try {
      const { id } = req.params;
      await db.execute('DELETE FROM coupons WHERE id = ?', [id]);
      res.json({ code: 0, message: '删除成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getDiscounts(req, res) {
    try {
      const { status } = req.query;
      let sql = 'SELECT * FROM discounts WHERE 1=1';
      const params = [];

      if (status !== undefined && status !== '') {
        const now = new Date();
        const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

        if (status === 'active') {
          sql += ' AND status = 1 AND CONCAT(start_date, " ", start_time) <= ? AND CONCAT(end_date, " ", end_time) >= ?';
          params.push(nowStr, nowStr);
        } else if (status === 'inactive') {
          sql += ' AND status = 1 AND CONCAT(start_date, " ", start_time) > ?';
          params.push(nowStr);
        } else if (status === 'expired') {
          sql += ' AND (status = 0 OR CONCAT(end_date, " ", end_time) < ?)';
          params.push(nowStr);
        }
      }

      sql += ' ORDER BY created_at DESC';

      const discounts = await db.query(sql, params);

      for (let discount of discounts) {
        try {
          const types = discount.service_types ? JSON.parse(discount.service_types) : [];
          discount.item_count = types.length;
        } catch (e) {
          discount.item_count = 0;
        }
        discount.order_count = 0;
        discount.saved_amount = '0.00';
        discount.progress = 0;
      }

      res.json({ code: 0, data: discounts });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getDiscount(req, res) {
    try {
      const { id } = req.params;
      const discounts = await db.query('SELECT * FROM discounts WHERE id = ?', [id]);
      if (discounts.length > 0) {
        res.json({ code: 0, data: discounts[0] });
      } else {
        res.json({ code: -1, message: '折扣活动不存在' });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async createDiscount(req, res) {
    try {
      const { name, description, discount, start_date, end_date, start_time, end_time, service_types = '[]', user_limit = 0, status = 'active' } = req.body;
      const statusValue = status === 'active' ? 1 : 0;
      const result = await db.execute(
        'INSERT INTO discounts (name, description, discount, start_date, end_date, start_time, end_time, service_types, user_limit, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, description, discount, start_date, end_date, start_time, end_time, service_types, user_limit, statusValue]
      );
      res.json({ code: 0, data: { id: result.insertId }, message: '创建成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateDiscount(req, res) {
    try {
      const { id } = req.params;
      const { name, description, discount, start_date, end_date, start_time, end_time, service_types, user_limit, status } = req.body;
      const updates = [];
      const params = [];

      if (name) { updates.push('name = ?'); params.push(name); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (discount !== undefined) { updates.push('discount = ?'); params.push(discount); }
      if (start_date) { updates.push('start_date = ?'); params.push(start_date); }
      if (end_date) { updates.push('end_date = ?'); params.push(end_date); }
      if (start_time) { updates.push('start_time = ?'); params.push(start_time); }
      if (end_time) { updates.push('end_time = ?'); params.push(end_time); }
      if (service_types !== undefined) { updates.push('service_types = ?'); params.push(service_types); }
      if (user_limit !== undefined) { updates.push('user_limit = ?'); params.push(user_limit); }
      if (status !== undefined) { updates.push('status = ?'); params.push(status === 'active' ? 1 : 0); }

      if (updates.length === 0) {
        return res.json({ code: -1, message: '没有更新内容' });
      }

      params.push(id);
      await db.execute(`UPDATE discounts SET ${updates.join(', ')} WHERE id = ?`, params);
      res.json({ code: 0, message: '更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async deleteDiscount(req, res) {
    try {
      const { id } = req.params;
      await db.execute('DELETE FROM discounts WHERE id = ?', [id]);
      res.json({ code: 0, message: '删除成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getNewUserActivities(req, res) {
    try {
      const activities = await db.query('SELECT * FROM coupons WHERE type = 1 ORDER BY created_at DESC');
      res.json({ code: 0, data: activities });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getNewUserActivity(req, res) {
    try {
      const { id } = req.params;
      const activities = await db.query('SELECT * FROM coupons WHERE id = ? AND type = 1', [id]);
      if (activities.length > 0) {
        const activity = activities[0];
        const data = {
          id: activity.id,
          name: activity.name,
          description: activity.description || '',
          start_time: activity.valid_start || '',
          end_time: activity.valid_end || '',
          gifts: [],
          condition: 'register',
          status: activity.status === 1 ? 'active' : 'inactive'
        };

        if (activity.service_types) {
          try {
            data.gifts = JSON.parse(activity.service_types);
          } catch (e) {
            data.gifts = [];
          }
        }

        res.json({ code: 0, data: data });
      } else {
        res.json({ code: -1, message: '活动不存在' });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async createNewUserActivity(req, res) {
    try {
      const { name, description, start_time, end_time, gifts, condition, status = 'active' } = req.body;

      let discount_value = 0;
      if (gifts && gifts.length > 0) {
        gifts.forEach(gift => {
          if (gift.amount) {
            const amount = parseFloat(gift.amount);
            if (!isNaN(amount)) {
              discount_value += amount;
            }
          }
        });
      }

      const service_types = JSON.stringify(gifts || []);

      const result = await db.execute(
        'INSERT INTO coupons (name, type, discount_value, min_amount, valid_start, valid_end, total_count, status, service_types, description) VALUES (?, 1, ?, 0, ?, ?, 1000, ?, ?, ?)',
        [name, discount_value, start_time, end_time ? `${String(end_time).split('T')[0].split(' ')[0]} 23:59:59` : end_time, status === 'active' ? 1 : 0, service_types, description || '']
      );
      res.json({ code: 0, data: { id: result.insertId }, message: '创建成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateNewUserActivity(req, res) {
    try {
      const { id } = req.params;
      const { name, description, start_time, end_time, gifts, condition, status } = req.body;
      const updates = [];
      const params = [];

      if (name) { updates.push('name = ?'); params.push(name); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (start_time) { updates.push('valid_start = ?'); params.push(start_time); }
      if (end_time) {
        const endDate = String(end_time).split('T')[0].split(' ')[0];
        updates.push('valid_end = ?');
        params.push(`${endDate} 23:59:59`);
      }

      if (gifts && gifts.length > 0) {
        let discount_value = 0;
        gifts.forEach(gift => {
          if (gift.amount) {
            const amount = parseFloat(gift.amount);
            if (!isNaN(amount)) {
              discount_value += amount;
            }
          }
        });
        updates.push('discount_value = ?'); params.push(discount_value);
        updates.push('service_types = ?'); params.push(JSON.stringify(gifts));
      }

      if (status !== undefined) { updates.push('status = ?'); params.push(status === 'active' ? 1 : 0); }

      if (updates.length === 0) {
        return res.json({ code: -1, message: '没有更新内容' });
      }

      params.push(id);
      await db.execute(`UPDATE coupons SET ${updates.join(', ')} WHERE id = ?`, params);
      res.json({ code: 0, message: '更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async deleteNewUserActivity(req, res) {
    try {
      const { id } = req.params;
      await db.execute('DELETE FROM coupons WHERE id = ? AND type = 1', [id]);
      res.json({ code: 0, message: '删除成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getGroupActivities(req, res) {
    try {
      await syncAllEndedGroupActivities();
      const status = req.query.status || req.body.status || '';
      const activities = await db.query('SELECT * FROM coupons WHERE type = 3 ORDER BY created_at DESC');
      
      const result = await Promise.all(activities.map(async (activity) => {
        const peopleResult = await db.query(
          'SELECT COUNT(*) as count FROM orders WHERE group_activity_id = ? AND status NOT IN (5, 7)',
          [activity.id]
        );
        const currentPeople = peopleResult[0]?.count || 0;
        const maxPeople = activity.total_count || 100;
        const progress = maxPeople > 0 ? Math.round((currentPeople / maxPeople) * 100) : 0;
        const lifecycle = buildLifecycleMeta(activity, currentPeople);
        const statusStr = lifecycle.activity_status;
        
        const validStartStr = activity.valid_start instanceof Date ? activity.valid_start.toISOString().replace('T', ' ') : 
                            typeof activity.valid_start === 'string' ? activity.valid_start : '';
        const enriched = await enrichGroupActivity(activity);
        
        return {
          id: activity.id,
          name: activity.name,
          description: activity.description,
          location: activity.location || '',
          start_time: validStartStr ? validStartStr.split(' ')[0] : '',
          max_people: maxPeople,
          min_people: parseInt(activity.min_amount) || 0,
          current_people: currentPeople,
          price: parseFloat(activity.discount_value) || 0,
          status: statusStr,
          progress: progress,
          group_success: !!activity.group_success,
          activity_ended: lifecycle.activity_ended,
          viewOnly: lifecycle.viewOnly,
          lifecycle_text: lifecycle.lifecycle_text,
          service_types: activity.service_types ? JSON.parse(activity.service_types) : [],
          provider_id: enriched.provider_id || '',
          pending_provider_id: enriched.pending_provider_id || '',
          provider_assign_status: enriched.provider_assign_status,
          provider_status_key: enriched.provider_status_key,
          provider_status_text: enriched.provider_status_text,
          provider_display: enriched.provider_display,
          provider_name: enriched.provider_name,
          pending_provider_name: enriched.pending_provider_name,
          created_at: activity.created_at,
          updated_at: activity.updated_at
        };
      }));
      
      let filteredResult = result;
      if (status && status !== '' && status !== 'undefined') {
        filteredResult = result.filter(item => item.status === status);
      }
      
      res.json({ code: 0, data: filteredResult });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getGroupActivity(req, res) {
    try {
      const { id } = req.params;
      await syncEndedGroupOrders(id);
      const activities = await db.query('SELECT * FROM coupons WHERE id = ? AND type = 3', [id]);
      if (activities.length > 0) {
        const activity = activities[0];
        const peopleResult = await db.query(
          'SELECT COUNT(*) as count FROM orders WHERE group_activity_id = ? AND status NOT IN (5, 7)',
          [activity.id]
        );
        const currentPeople = peopleResult[0]?.count || 0;
        const maxPeople = activity.total_count || 100;
        const progress = maxPeople > 0 ? Math.round((currentPeople / maxPeople) * 100) : 0;
        const lifecycle = buildLifecycleMeta(activity, currentPeople);
        const statusStr = lifecycle.activity_status;
        
        let datePart = '';
        let timePart = '';
        let validStartStr = '';
        if (activity.valid_start instanceof Date) {
          const d = new Date(activity.valid_start);
          datePart = d.toISOString().split('T')[0];
          timePart = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          validStartStr = d.toISOString().replace('T', ' ');
        } else if (typeof activity.valid_start === 'string') {
          const [d, t] = activity.valid_start.split(' ');
          datePart = d;
          timePart = t ? t.slice(0, 5) : '';
          validStartStr = activity.valid_start;
        }
        
        const validEndStr = activity.valid_end instanceof Date ? activity.valid_end.toISOString().replace('T', ' ') : 
                          typeof activity.valid_end === 'string' ? activity.valid_end : '';
        const duration = validStartStr && validEndStr ? Math.round((new Date(validEndStr) - new Date(validStartStr)) / (1000 * 60 * 60)) : 24;
        const enriched = await enrichGroupActivity(activity);
        
        res.json({ 
          code: 0, 
          data: {
            id: activity.id,
            name: activity.name,
            description: activity.description,
            location: activity.location || '',
            start_time: datePart,
            start_hour: timePart,
            max_people: maxPeople,
            min_people: parseInt(activity.min_amount) || 0,
            current_people: currentPeople,
            price: parseFloat(activity.discount_value) || 0,
            status: statusStr,
            progress: progress,
            service_types: activity.service_types ? JSON.parse(activity.service_types) : [],
            notice: '',
            duration: duration,
            provider_id: enriched.provider_id || '',
            pending_provider_id: enriched.pending_provider_id || '',
            provider_assign_status: enriched.provider_assign_status,
            provider_status_key: enriched.provider_status_key,
            provider_status_text: enriched.provider_status_text,
            provider_display: enriched.provider_display,
            provider_name: enriched.provider_name,
            pending_provider_name: enriched.pending_provider_name,
            group_success: !!activity.group_success,
            activity_ended: lifecycle.activity_ended,
            viewOnly: lifecycle.viewOnly,
            lifecycle_text: lifecycle.lifecycle_text,
            created_at: activity.created_at,
            updated_at: activity.updated_at
          } 
        });
      } else {
        res.json({ code: -1, message: '活动不存在' });
      }
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async createGroupActivity(req, res) {
    try {
      const { name, description, location, start_time, start_hour, duration, min_people, max_people, provider_id, service_types, price, status = 'active', notice } = req.body;
      
      const validStart = `${start_time} ${start_hour || '00:00'}`;
      const durationHours = parseInt(duration) || 24;
      const validEnd = new Date(new Date(validStart).getTime() + durationHours * 60 * 60 * 1000);
      
      const validEndDate = validEnd.toISOString().split('T')[0];
      const validEndTime = validEnd.toTimeString().slice(0, 8);
      const validEndStr = `${validEndDate} ${validEndTime}`;
      
      const result = await db.execute(
        'INSERT INTO coupons (name, type, description, location, discount_value, valid_start, valid_end, total_count, status, service_types, min_amount, provider_id, provider_assign_status) VALUES (?, 3, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)',
        [name, description || '', location || '', price || 0, validStart, validEndStr, max_people || 100, status === 'active' ? 1 : 0, JSON.stringify(service_types || []), min_people || 0]
      );

      const activityId = result.insertId;
      if (provider_id) {
        await sendGroupProviderInvite(activityId, provider_id);
      }

      res.json({ code: 0, data: { id: activityId }, message: provider_id ? '创建成功，已向服务人员发送邀请' : '创建成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateGroupActivity(req, res) {
    try {
      const { id } = req.params;
      await assertGroupActivityEditable(id);
      const { name, description, location, start_time, start_hour, duration, min_people, max_people, provider_id, service_types, price, status, notice } = req.body;
      const updates = [];
      const params = [];

      if (name) { updates.push('name = ?'); params.push(name); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (location) { updates.push('location = ?'); params.push(location); }
      if (min_people !== undefined) { updates.push('min_amount = ?'); params.push(min_people); }
      
      if (start_time || start_hour) {
        const existingCoupon = await db.query('SELECT valid_start, valid_end FROM coupons WHERE id = ?', [id]);
        const existingStartVal = existingCoupon[0]?.valid_start;
        const existingStart = existingStartVal instanceof Date ? existingStartVal.toISOString().replace('T', ' ') : 
                            typeof existingStartVal === 'string' ? existingStartVal : '2026-01-01 00:00:00';
        const [datePart] = existingStart.split(' ');
        const newDate = start_time || datePart;
        const newTime = start_hour || (existingStart.split(' ')[1] || '00:00:00');
        const validStart = `${newDate} ${newTime}`;
        
        const durationHours = parseInt(duration) || 24;
        const validEnd = new Date(new Date(validStart).getTime() + durationHours * 60 * 60 * 1000);
        
        const validEndDate = validEnd.toISOString().split('T')[0];
        const validEndTime = validEnd.toTimeString().slice(0, 8);
        const validEndStr = `${validEndDate} ${validEndTime}`;
        
        updates.push('valid_start = ?'); params.push(validStart);
        updates.push('valid_end = ?'); params.push(validEndStr);
      }
      
      if (max_people) { updates.push('total_count = ?'); params.push(max_people); }
      if (price !== undefined) { updates.push('discount_value = ?'); params.push(price); }
      if (service_types !== undefined) { updates.push('service_types = ?'); params.push(JSON.stringify(service_types)); }
      if (status !== undefined) { updates.push('status = ?'); params.push(status === 'active' ? 1 : 0); }

      if (updates.length === 0) {
        return res.json({ code: -1, message: '没有更新内容' });
      }

      params.push(id);
      await db.execute(`UPDATE coupons SET ${updates.join(', ')} WHERE id = ?`, params);
      res.json({ code: 0, message: '更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async inviteGroupProvider(req, res) {
    try {
      const { id } = req.params;
      const { provider_id } = req.body;
      const data = await sendGroupProviderInvite(id, provider_id);
      res.json({ code: 0, data, message: '已向服务人员发送带团邀请' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async deleteGroupActivity(req, res) {
    try {
      const { id } = req.params;
      await assertGroupActivityEditable(id);
      await db.execute('DELETE FROM coupons WHERE id = ? AND type = 3', [id]);
      res.json({ code: 0, message: '删除成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async succeedGroupActivity(req, res) {
    try {
      const { id } = req.params;
      const activities = await db.query('SELECT * FROM coupons WHERE id = ? AND type = 3', [id]);
      if (!activities.length) {
        return res.json({ code: -1, message: '组团活动不存在' });
      }
      const activity = activities[0];
      const currentPeople = await countGroupParticipants(activity.id);
      const minPeople = parseInt(activity.min_amount, 10) || 0;
      if (currentPeople < minPeople) {
        return res.json({ code: -1, message: `当前仅 ${currentPeople} 人，未达到最低成团人数 ${minPeople}` });
      }
      await db.execute('UPDATE coupons SET group_success = 1 WHERE id = ?', [id]);
      await syncEndedGroupOrders(id);
      res.json({ code: 0, message: '组团成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = AdminMarketingController;