const app = getApp();

Page({
  data: {
    currentTab: 'toProvider',
    toProviderReviews: [],
    toUserReviews: [],
    isLoading: true
  },

  onLoad: function () {
    this.loadReviews();
  },

  onShow: function () {
    this.loadReviews();
  },

  switchTab: function (e) {
    this.setData({ currentTab: e.currentTarget.dataset.tab });
  },

  loadReviews: function () {
    app.switchRole('user');
    const session = app.getUserSession();
    if (!session.token || !session.userInfo) {
      this.setData({ isLoading: false, toProviderReviews: [], toUserReviews: [] });
      return;
    }

    this.setData({ isLoading: true });
    Promise.all([
      this.loadToProviderReviews(),
      this.loadToUserReviews()
    ]).finally(() => {
      this.setData({ isLoading: false });
    });
  },

  loadToProviderReviews: function () {
    return app.request({ url: '/reviews/user' }).then((res) => {
      this.setData({ toProviderReviews: res.code === 0 && res.data ? res.data : [] });
    }).catch(() => {
      this.setData({ toProviderReviews: [] });
    });
  },

  loadToUserReviews: function () {
    return app.request({ url: '/reviews/from-provider' }).then((res) => {
      this.setData({ toUserReviews: res.code === 0 && res.data ? res.data : [] });
    }).catch(() => {
      this.setData({ toUserReviews: [] });
    });
  }
});
