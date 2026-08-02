const app = getApp();

Page({
  data: {
    activities: []
  },

  onLoad: function () {
    this.loadActivities();
  },

  onShow: function () {
    this.loadActivities();
  },

  loadActivities: function () {
    app.request({
      url: '/admin/marketing/newuser'
    }).then(res => {
      if (res.code === 0) {
        this.setData({ activities: res.data });
      } else {
        this.setData({ activities: [] });
      }
    }).catch(() => {
      this.setData({ activities: [] });
    });
  },

  goToAdd: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/newuser/detail/detail' });
  },

  goToDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-marketing/newuser/detail/detail?id=${id}` });
  },

  getStatusText: function (status) {
    const texts = {
      active: '进行中',
      inactive: '未开始',
      expired: '已结束'
    };
    return texts[status] || '未知';
  }
});