const app = getApp();

Page({
  data: {
    types: []
  },

  onLoad: function () {
    this.loadTypes();
  },

  onShow: function () {
    this.loadTypes();
  },

  loadTypes: function () {
    app.request({
      url: '/admin/service-types'
    }).then(res => {
      if (res.code === 0) {
        this.setData({ types: res.data });
      } else {
        this.setData({ types: [] });
      }
    }).catch(() => {
      this.setData({ types: [] });
    });
  },

  goToAddType: function () {
    wx.navigateTo({ url: '/pages/admin-services/types/detail/detail' });
  },

  goToTypeDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-services/types/detail/detail?id=${id}` });
  },

  toggleStatus: function (e) {
    const id = e.currentTarget.dataset.id;
    const currentStatus = e.currentTarget.dataset.status;
    const newStatus = currentStatus === 1 ? 0 : 1;

    app.request({
      url: `/admin/service-types/${id}/status`,
      method: 'PUT',
      data: { status: newStatus }
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: newStatus === 1 ? '启用成功' : '禁用成功', icon: 'success' });
        this.loadTypes();
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  getStatusText: function (status) {
    return status === 1 ? '启用' : '禁用';
  }
});