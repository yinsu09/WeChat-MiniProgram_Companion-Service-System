const app = getApp();

Page({
  data: {
    activities: [],
    loading: false
  },

  onLoad() {
    this.loadActivities();
  },

  onShow() {
    this.loadActivities();
  },

  loadActivities() {
    this.setData({ loading: true });
    app.request({ url: '/marketing/group' }).then((res) => {
      this.setData({
        activities: res.code === 0 ? (res.data || []) : [],
        loading: false
      });
    }).catch(() => {
      this.setData({ activities: [], loading: false });
    });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/group-tour-detail/group-tour-detail?id=${id}` });
  }
});
