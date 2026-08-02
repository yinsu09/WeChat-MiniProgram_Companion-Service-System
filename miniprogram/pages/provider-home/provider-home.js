const app = getApp();

Page({
  data: {
    providerInfo: null,
    monthlyIncome: 0,
    totalOrders: 0,
    pendingOrders: 0,
    waitingServiceOrders: 0,
    inServiceOrders: 0,
    ongoingOrders: 0,
    unreadCount: 0,
    pendingOrder: null
  },

  onLoad: function () {
    this.loadProviderData();
  },

  onShow: function () {
    app.switchRole('provider');
    this.loadProviderData();
  },

  loadProviderData: function () {
    app.request({
      url: '/provider/profile',
      authRole: 'provider'
    }).then(res => {
      if (res.code === 0 && res.data) {
        const providerInfo = res.data;
        const session = app.getSession('provider');
        if (session.token) {
          app.setSession('provider', session.token, providerInfo);
        }
        this.setData({ providerInfo });
      } else {
        this.loadLocalProviderInfo();
      }
    }).catch(() => {
      this.loadLocalProviderInfo();
    });

    app.request({
      url: '/provider/dashboard'
    }).then(res => {
      if (res.code === 0) {
        this.setData({
          monthlyIncome: res.data.monthlyIncome || 0,
          totalOrders: res.data.totalOrders || 0,
          pendingOrders: res.data.pendingOrders || 0,
          waitingServiceOrders: res.data.waitingServiceOrders || 0,
          inServiceOrders: res.data.inServiceOrders || 0,
          ongoingOrders: res.data.inServiceOrders || 0,
          unreadCount: res.data.unreadCount || 0,
          pendingOrder: res.data.pendingOrder || null
        });
      }
    }).catch(() => {});
  },

  loadLocalProviderInfo: function () {
    const providerInfo = app.getSession('provider').userInfo || app.globalData.providerInfo;
    if (providerInfo) {
      this.setData({ providerInfo });
    }
  },

  goToOrders: function (e) {
    const status = e.currentTarget.dataset.status;
    wx.navigateTo({
      url: `/pages/provider-orders/provider-orders?status=${status}`
    });
  },

  goToPage: function (e) {
    const page = e.currentTarget.dataset.page;
    if (page === 'provider-profile') {
      wx.navigateTo({ url: '/pages/provider-profile/provider-profile' });
    } else if (page === 'provider-my-services') {
      wx.navigateTo({ url: '/pages/provider-my-services/provider-my-services' });
    } else if (page === 'provider-services') {
      wx.navigateTo({ url: '/pages/provider-services/provider-services' });
    } else if (page === 'provider-income') {
      wx.navigateTo({ url: '/pages/provider-income/provider-income' });
    } else if (page === 'provider-notifications') {
      wx.navigateTo({ url: '/pages/provider-notifications/provider-notifications' });
    } else if (page === 'provider-reviews') {
      wx.navigateTo({ url: '/pages/provider-reviews/provider-reviews' });
    }
  },

  goToProfile: function () {
    wx.navigateTo({
      url: '/pages/provider-profile/provider-profile'
    });
  },

  goToServices: function () {
    wx.navigateTo({
      url: '/pages/provider-services/provider-services'
    });
  },

  goToIncome: function () {
    wx.navigateTo({
      url: '/pages/provider-income/provider-income'
    });
  },

  goToNotifications: function () {
    wx.navigateTo({
      url: '/pages/provider-notifications/provider-notifications'
    });
  }
});
