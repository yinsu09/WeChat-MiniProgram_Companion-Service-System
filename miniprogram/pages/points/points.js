const app = getApp();

Page({
  data: {
    points: 0,
    memberLevel: '普通会员',
    nextLevelPoints: 0,
    totalConsumed: 0,
    earnedPoints: 0,
    usedPoints: 0,
    recentRecords: []
  },

  onLoad: function () {
    this.loadPointsData();
  },

  onShow: function () {
    app.switchRole('user');
    this.loadPointsData();
  },

  loadPointsData: function () {
    if (!app.getUserSession().token) {
      this.setData({
        points: 0,
        memberLevel: '普通会员',
        nextLevelPoints: 0,
        totalConsumed: 0,
        earnedPoints: 0,
        usedPoints: 0,
        recentRecords: []
      });
      return;
    }

    app.request({ url: '/user/points' }).then((res) => {
      if (res.code === 0 && res.data) {
        const data = {
          points: Number(res.data.points) || 0,
          memberLevel: res.data.memberLevel || '普通会员',
          nextLevelPoints: Number(res.data.nextLevelPoints) || 0,
          totalConsumed: Number(res.data.totalConsumed) || 0,
          earnedPoints: Number(res.data.earnedPoints) || 0,
          usedPoints: Number(res.data.usedPoints) || 0,
          recentRecords: res.data.recentRecords || []
        };
        this.setData(data);
        app.updateUserPoints(data.points);
      } else {
        this.setData({
          points: 0,
          memberLevel: '普通会员',
          nextLevelPoints: 0,
          totalConsumed: 0,
          earnedPoints: 0,
          usedPoints: 0,
          recentRecords: []
        });
      }
    }).catch(() => {
      this.setData({
        points: 0,
        memberLevel: '普通会员',
        nextLevelPoints: 0,
        totalConsumed: 0,
        earnedPoints: 0,
        usedPoints: 0,
        recentRecords: []
      });
    });
  },

  goToPointsRecord: function () {
    wx.navigateTo({
      url: '/pages/points-record/points-record'
    });
  },

  goToPointsMall: function () {
    wx.navigateTo({
      url: '/pages/points-mall/points-mall'
    });
  },

  goToCoupons: function () {
    wx.navigateTo({
      url: '/pages/coupons/coupons'
    });
  }
});