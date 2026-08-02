const app = getApp();

Page({
  data: {
    userInfo: null,
    points: 0,
    coupons: 0,
    newCoupons: 0,
    orderStats: { pending: 0, completed: 0, refund: 0 },
    menuItems: [
      { icon: '🔔', label: '消息通知', badge: 0 },
      { icon: '🎫', label: '优惠券', badge: 0 },
      { icon: '🚌', label: '组团游', badge: 0 },
      { icon: '⭐', label: '积分中心', badge: 0 },
      { icon: '📝', label: '我的评价', badge: 0 },
      { icon: '⚙️', label: '设置', badge: 0 },
      { icon: '📞', label: '联系客服', badge: 0 },
      { icon: '🚪', label: '退出登录', badge: 0 }
    ]
  },

  onLoad: function () {
    app.switchRole('user');
    this.refreshUserInfo();
    this.loadUserStats();
  },

  onShow: function () {
    app.switchRole('user');
    this.refreshUserInfo();
    this.loadUserStats();
  },

  refreshUserInfo: function () {
    const session = app.getUserSession();
    this.setData({ userInfo: session.userInfo || app.globalData.userInfo });
  },

  loadUserStats: function () {
    const session = app.getUserSession();
    if (!session.token) {
      this.setData({
        points: 0,
        coupons: 0,
        orderStats: { pending: 0, completed: 0, refund: 0 },
        menuItems: this.data.menuItems.map((item) => (
          ['优惠券', '消息通知'].includes(item.label) ? { ...item, badge: 0 } : item
        ))
      });
      return;
    }

    app.request({ url: '/user/profile-stats', authRole: 'user' }).then((res) => {
      if (res.code === 0 && res.data) {
        const points = res.data.points || 0;
        app.updateUserPoints(points);
        const menuItems = this.data.menuItems.map((item) => {
          if (item.label === '优惠券') {
            return { ...item, badge: res.data.newCoupons || 0 };
          }
          return item;
        });
        this.setData({
          points,
          coupons: res.data.coupons || 0,
          newCoupons: res.data.newCoupons || 0,
          orderStats: res.data.orderStats || { pending: 0, completed: 0, refund: 0 },
          menuItems,
          userInfo: {
            ...(this.data.userInfo || {}),
            ...(app.getUserSession().userInfo || {})
          }
        });
      }
    }).catch(() => {
      this.setData({
        points: 0,
        coupons: 0,
        orderStats: { pending: 0, completed: 0, refund: 0 }
      });
    });

    app.request({ url: '/user/notifications', authRole: 'user' }).then((res) => {
      if (res.code === 0 && res.data) {
        const unread = res.data.unreadCount || 0;
        const menuItems = this.data.menuItems.map((item) => (
          item.label === '消息通知' ? { ...item, badge: unread } : item
        ));
        this.setData({ menuItems });
      }
    }).catch(() => {});
  },

  goToOrders: function () {
    wx.switchTab({ url: '/pages/orders/orders' });
  },

  goToEdit: function () {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
  },

  goToPage: function (e) {
    const label = e.currentTarget.dataset.label;
    if (label === '消息通知') {
      wx.navigateTo({ url: '/pages/user-notifications/user-notifications' });
    } else if (label === '我的评价') {
      wx.navigateTo({ url: '/pages/my-reviews/my-reviews' });
    } else if (label === '积分中心') {
      wx.navigateTo({ url: '/pages/points/points' });
    } else if (label === '优惠券') {
      wx.navigateTo({ url: '/pages/coupons/coupons' });
    } else if (label === '组团游') {
      wx.navigateTo({ url: '/pages/group-tours/group-tours' });
    } else if (label === '联系客服') {
      wx.showToast({ title: '客服热线: 400-123-4567', icon: 'none' });
    } else if (label === '设置') {
      wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
    } else if (label === '退出登录') {
      wx.showModal({
        title: '确认退出',
        content: '确定要退出登录吗？',
        success: (res) => {
          if (res.confirm) {
            app.clearSession('user');
            wx.redirectTo({ url: '/pages/login-user/login-user' });
          }
        }
      });
    }
  }
});
