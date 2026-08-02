const app = getApp();

Page({
  data: {
    currentTab: 'toUser',
    toUserReviews: [],
    fromProviderReviews: []
  },

  onLoad: function () {
    this.loadReviews();
  },

  onShow: function () {
    this.loadReviews();
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },

  loadReviews: function () {
    app.request({
      url: '/provider/reviews'
    }).then(res => {
      if (res.code === 0 && res.data) {
        this.setData({
          toUserReviews: this.normalizeReviews(res.data.toUser),
          fromProviderReviews: this.normalizeReviews(res.data.fromProvider)
        });
      } else {
        this.setData({
          toUserReviews: [],
          fromProviderReviews: []
        });
        if (res.message) {
          wx.showToast({ title: res.message, icon: 'none' });
        }
      }
    }).catch(() => {
      this.setData({
        toUserReviews: [],
        fromProviderReviews: []
      });
      wx.showToast({ title: '加载评价失败', icon: 'none' });
    });
  },

  normalizeReviews: function (list) {
    return (list || []).map((item) => ({
      ...item,
      user_avatar: item.user_avatar ? app.resolveImageUrl(item.user_avatar) : ''
    }));
  }
});