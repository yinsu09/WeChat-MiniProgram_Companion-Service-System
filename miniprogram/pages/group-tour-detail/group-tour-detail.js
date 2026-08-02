const app = getApp();

Page({
  data: {
    activity: null,
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.loadDetail(options.id);
    }
  },

  loadDetail(id) {
    this.setData({ loading: true });
    app.request({ url: `/marketing/group/${id}` }).then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({ activity: res.data, loading: false });
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ loading: false });
    });
  },

  joinActivity() {
    const { activity } = this.data;
    if (!activity) return;
    if (activity.joined) {
      wx.showToast({ title: '您已报名', icon: 'none' });
      return;
    }
    if (activity.status === 'full') {
      wx.showToast({ title: '名额已满', icon: 'none' });
      return;
    }
    if (activity.status === 'completed') {
      wx.showToast({ title: '活动已结束', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认报名',
      content: `确定报名「${activity.name}」吗？活动费用 ¥${activity.price}`,
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/marketing/group/${activity.id}/join`,
            method: 'POST'
          }).then((joinRes) => {
            if (joinRes.code === 0) {
              wx.showToast({ title: joinRes.message || '报名成功', icon: 'success' });
              setTimeout(() => {
                wx.navigateTo({ url: '/pages/orders/orders' });
              }, 1500);
            } else {
              wx.showToast({ title: joinRes.message || '报名失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '报名失败', icon: 'none' });
          });
        }
      }
    });
  }
});
