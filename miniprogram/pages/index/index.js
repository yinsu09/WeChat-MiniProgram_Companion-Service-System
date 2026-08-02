const app = getApp();

Page({
  data: {
    serviceTypes: [],
    hotServices: [],
    recommendProviders: [],
    recommendServices: [],
    limitedOffers: [],
    offerEndTime: ''
  },

  onLoad: function () {
    this.loadAllData();
  },

  onShow: function () {
    app.switchRole('user');
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      });
    }
  },

  loadAllData: function () {
    this.loadServiceTypes();
    this.loadHotServices();
    this.loadRecommendProviders();
    this.loadRecommendServices();
    this.loadLimitedOffers();
  },

  loadServiceTypes: function () {
    const iconMap = {
      1: '🏥', 2: '👩‍⚕️', 3: '🎮', 4: '🍽️', 5: '🚗', 6: '📚', 7: '💬'
    };

    app.request({ url: '/services/types' }).then((res) => {
      if (res.code === 0 && res.data && res.data.length > 0) {
        const serviceTypes = res.data.map((item) => ({
          ...item,
          icon: iconMap[item.id] || '🤝'
        }));
        this.setData({ serviceTypes });
      } else {
        this.setData({ serviceTypes: [] });
      }
    }).catch(() => {
      this.setData({ serviceTypes: [] });
    });
  },

  loadHotServices: function () {
    app.request({
      url: '/services/hot',
      data: { limit: 6 }
    }).then(res => {
      if (res.code === 0 && res.data && res.data.length > 0) {
        const hotServices = res.data.map((item) => ({
          ...item,
          cover_image: app.resolveImageUrl(item.cover_image)
        }));
        this.setData({ hotServices });
      } else {
        this.setData({ hotServices: [] });
      }
    }).catch(() => {
      this.setData({ hotServices: [] });
    });
  },

  loadRecommendProviders: function () {
    app.request({
      url: '/providers/recommend',
      data: { limit: 5 }
    }).then(res => {
      if (res.code === 0 && res.data && res.data.length > 0) {
        const recommendProviders = res.data.map((item) => ({
          ...item,
          avatar_url: app.resolveImageUrl(item.avatar_url)
        }));
        this.setData({ recommendProviders });
      } else {
        this.setData({ recommendProviders: [] });
      }
    }).catch(() => {
      this.setData({ recommendProviders: [] });
    });
  },

  loadRecommendServices: function () {
    app.request({
      url: '/services/recommend',
      data: { limit: 8 }
    }).then(res => {
      if (res.code === 0 && res.data && res.data.length > 0) {
        const recommendServices = res.data.map((item) => ({
          ...item,
          cover_image: app.resolveImageUrl(item.cover_image),
          rating: item.rating ? parseFloat(item.rating).toFixed(1) : ''
        }));
        this.setData({ recommendServices });
      } else {
        this.setData({ recommendServices: [] });
      }
    }).catch(() => {
      this.setData({ recommendServices: [] });
    });
  },

  loadLimitedOffers: function () {
    const endTime = this.calculateOfferEndTime();
    
    app.request({
      url: '/services/offers',
      data: { status: 1 }
    }).then(res => {
      if (res.code === 0 && res.data && res.data.length > 0) {
        const limitedOffers = res.data.map((item) => ({
          ...item,
          cover_image: app.resolveImageUrl(item.cover_image)
        }));
        this.setData({
          limitedOffers,
          offerEndTime: endTime
        });
      } else {
        this.setData({
          limitedOffers: [],
          offerEndTime: endTime
        });
      }
    }).catch(() => {
      this.setData({
        limitedOffers: [],
        offerEndTime: endTime
      });
    });
  },

  calculateOfferEndTime: function () {
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return `${end.getMonth() + 1}月${end.getDate()}日 ${end.getHours()}:00`;
  },

  goToSearch: function () {
    wx.navigateTo({
      url: '/pages/search/search'
    });
  },

  goToServiceList: function (e) {
    const typeId = e.currentTarget.dataset.typeId;
    wx.navigateTo({
      url: `/pages/service-list/service-list?typeId=${typeId}`
    });
  },

  goToServiceDetail: function (e) {
    const serviceId = e.currentTarget.dataset.serviceId;
    wx.navigateTo({
      url: `/pages/service-detail/service-detail?id=${serviceId}`
    });
  },

  goToProviderList: function () {
    wx.navigateTo({
      url: '/pages/search/search?tab=provider'
    });
  },

  goToProviderDetail: function (e) {
    const providerId = e.currentTarget.dataset.providerId;
    if (!providerId) return;
    wx.navigateTo({
      url: `/pages/provider-detail/provider-detail?id=${providerId}`
    });
  },

  onPullDownRefresh: function () {
    this.loadAllData();
    wx.stopPullDownRefresh();
  }
});
