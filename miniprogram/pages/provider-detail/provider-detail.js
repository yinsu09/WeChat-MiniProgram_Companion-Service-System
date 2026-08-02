const app = getApp();

Page({
  data: {
    provider: null,
    services: [],
    reviews: [],
    stats: {},
    loading: true
  },

  onLoad: function (options) {
    const id = options.id || options.providerId;
    if (id) {
      this.providerId = id;
      this.loadProvider(id);
      this.loadServices(id);
      this.loadReviews(id);
    } else {
      wx.showToast({ title: '缺少服务人员ID', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  normalizeProvider: function (data) {
    if (!data) return null;
    return {
      ...data,
      name: data.nickname || data.name || '服务人员',
      avatar_url: app.resolveImageUrl(data.avatar_url),
      rating: data.rating || '0.0',
      service_count: data.service_count || 0
    };
  },

  loadProvider: function (id) {
    app.request({ url: `/providers/${id}` }).then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({ provider: this.normalizeProvider(res.data), loading: false });
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    });
  },

  loadServices: function (id) {
    app.request({ url: `/providers/${id}/services` }).then((res) => {
      if (res.code === 0 && res.data) {
        const services = (res.data || []).map((item) => ({
          ...item,
          cover_image: app.resolveImageUrl(item.cover_image)
        }));
        this.setData({ services });
      }
    }).catch(() => {});
  },

  loadReviews: function (id) {
    app.request({
      url: `/reviews/provider/${id}`,
      data: { limit: 50 }
    }).then((res) => {
      if (res.code === 0 && res.data) {
        const reviews = (res.data.reviews || []).map((item) => ({
          ...item,
          user_avatar: app.resolveImageUrl(item.user_avatar),
          images: (item.images || []).map((url) => app.resolveImageUrl(url))
        }));
        this.setData({
          reviews,
          stats: res.data.stats || {}
        });
      }
    }).catch(() => {});
  },

  goServiceDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/service-detail/service-detail?id=${id}` });
  },

  previewImage: function (e) {
    const url = e.currentTarget.dataset.url;
    const urls = e.currentTarget.dataset.urls || [url];
    wx.previewImage({ current: url, urls });
  }
});
