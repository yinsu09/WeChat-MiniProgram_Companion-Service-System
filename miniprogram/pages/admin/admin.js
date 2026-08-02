const app = getApp();

Page({
  data: {
    stats: {
      totalUsers: 0,
      totalProviders: 0,
      totalOrders: 0,
      totalRevenue: 0,
      todayOrders: 0,
      pendingReviews: 0
    }
  },

  onLoad: function () {
    this.checkAdminAuth();
  },

  checkAdminAuth: function () {
    app.switchRole('admin');
    const adminSession = app.getSession('admin');
    const { token, userInfo } = adminSession;
    if (!token || !userInfo || Number(userInfo.role) !== 3) {
      wx.showToast({ title: '请先登录管理员账号', icon: 'none' });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/login-admin/login-admin' });
      }, 1500);
      return false;
    }
    return true;
  },

  onShow: function () {
    if (this.checkAdminAuth()) {
      this.loadStats();
    }
  },

  loadStats: function () {
    app.request({
      url: '/admin/stats'
    }).then(res => {
      if (res.code === 0) {
        const data = res.data || {};
        this.setData({
          stats: {
            ...this.data.stats,
            ...data,
            totalRevenue: data.totalRevenue || '0.00'
          }
        });
      }
    }).catch(() => {
      wx.showToast({ title: '获取统计数据失败', icon: 'none' });
    });
  },

  goToPage: function (e) {
    const page = e.currentTarget.dataset.page;
    const pages = {
      providers: '/pages/admin-providers/admin-providers',
      providerRules: '/pages/admin-providers/rules/rules',
      'provider-rules': '/pages/admin-providers/rules/rules',
      services: '/pages/admin-services/admin-services',
      orders: '/pages/admin-orders/admin-orders',
      refunds: '/pages/admin-refunds/admin-refunds',
      afterSales: '/pages/admin-after-sales/admin-after-sales',
      'after-sales': '/pages/admin-after-sales/admin-after-sales',
      aftersales: '/pages/admin-after-sales/admin-after-sales',
      statistics: '/pages/admin-statistics/admin-statistics',
      marketing: '/pages/admin-marketing/admin-marketing',
      assignRules: '/pages/admin-assign/admin-assign',
      'assign-rules': '/pages/admin-assign/admin-assign'
    };
    const url = pages[page];
    if (url) {
      wx.navigateTo({ url });
    } else {
      wx.showToast({ title: '功能开发中', icon: 'none' });
    }
  },

  handleLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出管理后台吗？',
      success: (res) => {
        if (res.confirm) {
          app.clearSession('admin');
          wx.removeStorageSync('admin_remember');
          wx.redirectTo({ url: '/pages/login-admin/login-admin' });
        }
      }
    });
  }
});
