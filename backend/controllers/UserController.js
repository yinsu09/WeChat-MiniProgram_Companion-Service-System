const User = require('../models/User');
const Notification = require('../models/Notification');
const jwt = require('jsonwebtoken');
const config = require('../config/server');
const db = require('../utils/db');
const { getUserPointsSummary } = require('../utils/pointsHelper');
const { tryGrantNewUserGifts } = require('../utils/newUserCouponHelper');

const codeStore = {};

async function finishUserLogin(user, tokenPayload, res, extra = {}) {
  const role = user.role ?? tokenPayload.role ?? 1;
  if (Number(role) === 1) {
    await tryGrantNewUserGifts(user.id, role);
  }
  const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: '7d' });
  const userInfo = await User.findById(user.id);
  res.json({ code: 0, data: { token, user: userInfo }, ...extra });
}

class UserController {
  static async login(req, res) {
    try {
      const { code, nickname, avatar_url, role = 1 } = req.body;
      const openid = 'mock_openid_' + Date.now();
      let user = await User.findByOpenid(openid);
      
      if (!user) {
        user = { id: await User.create({ 
          openid, 
          nickname: nickname || '用户' + Date.now(), 
          avatar_url: avatar_url || '', 
          phone: '',
          role 
        }), role };
      } else {
        if (nickname || avatar_url) {
          await User.update(user.id, { nickname, avatar_url });
        }
      }
      
      await finishUserLogin(user, { userId: user.id, openid }, res);
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async wechatLogin(req, res) {
    try {
      const { code, nickname, avatar_url, gender, role = 1 } = req.body;
      
      let openid = 'wechat_openid_' + (code || Date.now());
      
      let user = await User.findByOpenid(openid);
      
      if (!user) {
        user = { id: await User.create({ 
          openid, 
          nickname: nickname || '微信用户' + Date.now(), 
          avatar_url: avatar_url || '', 
          phone: '',
          gender: gender || 0,
          role 
        }), role };
      } else {
        const updates = {};
        if (nickname) updates.nickname = nickname;
        if (avatar_url) updates.avatar_url = avatar_url;
        if (gender !== undefined) updates.gender = gender;
        if (Object.keys(updates).length > 0) {
          await User.update(user.id, updates);
        }
      }
      
      await finishUserLogin(user, { userId: user.id, openid }, res);
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async loginByPassword(req, res) {
    try {
      const { phone, password, role = 1 } = req.body;
      
      if (!phone || !password) {
        return res.json({ code: -1, message: '手机号和密码不能为空' });
      }
      
      let user = await User.findByPhoneAndRole(phone, role);
      
      if (!user) {
        return res.json({ code: -1, message: '该手机号未注册' });
      }
      
      if (!user.password || user.password !== password) {
        return res.json({ code: -1, message: '密码错误' });
      }
      
      if (user.status === 0) {
        return res.json({ code: -1, message: '账号未审核通过' });
      }
      
      await finishUserLogin(user, { userId: user.id, phone }, res);
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async loginByPhone(req, res) {
    try {
      const { phone, code, role = 1 } = req.body;
      
      if (code !== '1111') {
        return res.json({ code: -1, message: '验证码错误' });
      }
      
      let user = await User.findByPhoneAndRole(phone, role);
      
      if (!user) {
        user = { id: await User.create({ 
          openid: 'phone_openid_' + phone,
          nickname: '用户' + phone.slice(-4),
          avatar_url: '',
          phone,
          role 
        }), role };
      }
      
      delete codeStore[phone];
      await finishUserLogin(user, { userId: user.id, phone }, res);
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async register(req, res) {
    try {
      const { phone, code, password, role = 1 } = req.body;
      
      if (code !== '1111') {
        return res.json({ code: -1, message: '验证码错误' });
      }
      
      const existingUser = await User.findByPhoneAndRole(phone, 1);
      if (existingUser) {
        return res.json({ code: -1, message: '该手机号已注册用户' });
      }
      
      const userId = await User.create({
        openid: 'phone_openid_' + phone,
        nickname: '用户' + phone.slice(-4),
        avatar_url: '',
        phone,
        password,
        role,
        status: 1
      });

      delete codeStore[phone];
      await finishUserLogin({ id: userId, role }, { userId, phone }, res, { message: '注册成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async sendCode(req, res) {
    try {
      const { phone } = req.body;
      const code = '1111';
      codeStore[phone] = code;
      
      console.log(`发送验证码到 ${phone}: ${code}`);
      
      res.json({ code: 0, message: '验证码已发送', data: { code } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async forgotPassword(req, res) {
    try {
      const { phone, code, newPassword } = req.body;
      
      if (code !== '1111') {
        return res.json({ code: -1, message: '验证码错误' });
      }
      
      let user = await User.findByPhone(phone);
      if (!user) {
        return res.json({ code: -1, message: '该手机号未注册' });
      }
      
      await User.update(user.id, { password: newPassword });
      delete codeStore[phone];
      res.json({ code: 0, message: '密码重置成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getUserInfo(req, res) {
    try {
      const user = await User.findById(req.userId);
      res.json({ code: 0, data: user });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getProfileStats(req, res) {
    try {
      const userId = req.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.json({ code: -1, message: '用户不存在' });
      }

      const pendingRows = await db.query(
        'SELECT COUNT(*) AS count FROM orders WHERE user_id = ? AND status IN (1, 2, 3)',
        [userId]
      );
      const completedRows = await db.query(
        'SELECT COUNT(*) AS count FROM orders WHERE user_id = ? AND status = 4',
        [userId]
      );
      const refundRows = await db.query(
        'SELECT COUNT(*) AS count FROM orders WHERE user_id = ? AND status IN (5, 6, 7)',
        [userId]
      );
      const couponRows = await db.query(
        `SELECT COUNT(*) AS count FROM user_coupons
         WHERE user_id = ? AND status = 1 AND (expire_time IS NULL OR expire_time > NOW())`,
        [userId]
      );
      const newCouponRows = await db.query(
        `SELECT COUNT(*) AS count FROM user_coupons
         WHERE user_id = ? AND status = 1 AND is_new = 1`,
        [userId]
      );

      const pointsSummary = await getUserPointsSummary(userId);

      res.json({
        code: 0,
        data: {
          points: pointsSummary.points,
          coupons: Number(couponRows[0]?.count || 0),
          newCoupons: Number(newCouponRows[0]?.count || 0),
          orderStats: {
            pending: Number(pendingRows[0]?.count || 0),
            completed: Number(completedRows[0]?.count || 0),
            refund: Number(refundRows[0]?.count || 0)
          }
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async updateUserInfo(req, res) {
    try {
      const allowed = ['nickname', 'avatar_url', 'gender', 'bio', 'real_name'];
      const updates = {};
      allowed.forEach((key) => {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      });
      if (!Object.keys(updates).length) {
        return res.json({ code: -1, message: '没有可更新的字段' });
      }
      await User.update(req.userId, updates);
      const user = await User.findById(req.userId);
      res.json({ code: 0, data: user, message: '更新成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async bindPhone(req, res) {
    try {
      const { phone, code } = req.body;
      
      if (code !== '1111') {
        return res.json({ code: -1, message: '验证码错误' });
      }

      const currentUser = await User.findById(req.userId);
      const existingUser = await User.findByPhoneAndRole(phone, currentUser.role);
      if (existingUser && existingUser.id !== req.userId) {
        return res.json({ code: -1, message: '该手机号已绑定其他同类型账号' });
      }
      
      await User.update(req.userId, { phone });
      delete codeStore[phone];
      res.json({ code: 0, message: '绑定成功' });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getNotifications(req, res) {
    try {
      const notifications = await Notification.getByUser(req.userId);
      const unreadCount = await Notification.getUnreadCount(req.userId);
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
}

module.exports = UserController;