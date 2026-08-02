const app = getApp();

Page({
  data: {
    stats: {
      couponCount: 0,
      discountCount: 0,
      newUserCount: 0,
      groupCount: 0,
      totalSaved: 0,
      increaseRate: 0,
      newUsers: 0,
      conversionRate: 0
    },
    activeActivities: []
  },

  onLoad: function () {
    this.loadStats();
    this.loadActiveActivities();
  },

  loadStats: function () {
    app.request({
      url: '/admin/marketing/stats'
    }).then(res => {
      if (res.code === 0) {
        this.setData({ stats: res.data });
      }
    }).catch(() => {
      wx.showToast({ title: '获取营销数据失败', icon: 'none' });
    });
  },

  loadActiveActivities: function () {
    app.request({
      url: '/admin/marketing/active'
    }).then(res => {
      if (res.code === 0) {
        this.setData({ activeActivities: res.data });
      }
    }).catch(() => {
      wx.showToast({ title: '获取活动数据失败', icon: 'none' });
    });
  },

  goToCoupons: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/coupons/coupons' });
  },

  goToDiscounts: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/discounts/discounts' });
  },

  goToNewUser: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/newuser/newuser' });
  },

  goToGroup: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/group/group' });
  },

  goToAddCoupon: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/coupons/detail/detail' });
  },

  goToAddDiscount: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/discounts/detail/detail' });
  },

  goToAddNewUser: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/newuser/detail/detail' });
  },

  goToAddGroup: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/group/detail/detail' });
  },

  goToActivityDetail: function (e) {
    const type = e.currentTarget.dataset.type;
    const id = e.currentTarget.dataset.id;
    const urls = {
      coupon: '/pages/admin-marketing/coupons/detail/detail',
      discount: '/pages/admin-marketing/discounts/detail/detail',
      new_user: '/pages/admin-marketing/newuser/detail/detail',
      group: '/pages/admin-marketing/group/detail/detail'
    };
    if (urls[type]) {
      wx.navigateTo({ url: `${urls[type]}?id=${id}` });
    }
  },

  getTypeLabel: function (type) {
    const labels = {
      coupon: '优惠券',
      discount: '限时折扣',
      new_user: '新人活动',
      group: '组团游'
    };
    return labels[type] || type;
  }
});
