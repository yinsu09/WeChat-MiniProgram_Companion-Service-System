const app = getApp();

Page({
  data: {
    currentTab: 'available',
    availableCoupons: [],
    usedCoupons: [],
    expiredCoupons: [],
    exchangeCoupons: [],
    currentCoupons: [],
    userPoints: 0
  },

  onLoad: function () {
    this.loadCoupons();
  },

  onShow: function () {
    app.switchRole('user');
    this.loadCoupons();
    app.request({ url: '/user/coupons/mark-read', method: 'POST', authRole: 'user' }).catch(() => {});
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    this.updateCurrentCoupons();
  },

  updateCurrentCoupons: function () {
    const { currentTab, availableCoupons, usedCoupons, expiredCoupons } = this.data;
    let coupons = [];
    if (currentTab === 'available') {
      coupons = availableCoupons;
    } else if (currentTab === 'used') {
      coupons = usedCoupons;
    } else {
      coupons = expiredCoupons;
    }
    this.setData({ currentCoupons: coupons });
  },

  loadCoupons: function () {
    if (!app.getUserSession().token) {
      this.setData({
        availableCoupons: [],
        usedCoupons: [],
        expiredCoupons: [],
        currentCoupons: []
      });
      return;
    }

    app.request({ url: '/user/coupons' }).then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({
          ...res.data,
          currentCoupons: res.data.availableCoupons || [],
          userPoints: Number(res.data.userPoints) || 0
        });
        app.updateUserPoints(Number(res.data.userPoints) || 0);
      } else {
        this.setData({
          availableCoupons: [],
          usedCoupons: [],
          expiredCoupons: [],
          currentCoupons: []
        });
      }
    }).catch(() => {
      this.setData({
        availableCoupons: [],
        usedCoupons: [],
        expiredCoupons: [],
        currentCoupons: []
      });
    });
  },

  goToServices: function () {
    wx.switchTab({
      url: '/pages/services/services'
    });
  },

  exchangeCoupon: function (e) {
    const couponId = e.currentTarget.dataset.id;
    const coupon = this.data.exchangeCoupons.find(c => c.id === couponId);

    if (!coupon) return;

    if (!coupon.canExchange) {
      wx.showToast({ title: '积分不足', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认兑换',
      content: `确定使用${coupon.points}积分兑换${coupon.name}吗？`,
      success: (res) => {
        if (res.confirm) {
          this.doExchange(couponId);
        }
      }
    });
  },

  doExchange: function (couponId) {
    app.request({
      url: '/user/exchange-coupon',
      method: 'POST',
      data: { coupon_id: couponId }
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '兑换成功', icon: 'success' });
        this.loadCoupons();
      } else {
        wx.showToast({ title: res.message || '兑换失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '兑换失败', icon: 'none' });
    });
  },

  redeemPointsCoupon: function (e) {
    const id = e.currentTarget.dataset.id;
    const coupon = this.data.availableCoupons.find(c => c.id === id);
    if (!coupon) return;

    wx.showModal({
      title: '兑换积分',
      content: `确定兑换「${coupon.name}」获得${coupon.value}积分吗？`,
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: '/user/redeem-points-coupon',
            method: 'POST',
            data: { id }
          }).then(result => {
            if (result.code === 0) {
              wx.showToast({ title: result.message || '兑换成功', icon: 'success' });
              this.loadCoupons();
            } else {
              wx.showToast({ title: result.message || '兑换失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '兑换失败', icon: 'none' });
          });
        }
      }
    });
  }
});