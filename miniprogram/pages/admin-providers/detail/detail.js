const app = getApp();

Page({
  data: {
    provider: {
      id: 0,
      nickname: '',
      phone: '',
      gender: '未知',
      avatar_url: '',
      service_types: '',
      service_area: '',
      introduction: '',
      level: 0,
      level_name: '新手服务',
      status: 'offline',
      disabled: false,
      service_count: 0,
      rating: 0,
      completed_orders: 0,
      canceled_orders: 0,
      review_count: 0,
      total_income: 0
    }
  },

  onLoad: function (options) {
    if (options && options.id) {
      this.loadProvider(options.id);
    } else {
      wx.showToast({ title: '缺少服务人员ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  loadProvider: function (id) {
    app.request({
      url: `/admin/providers/${id}`
    }).then(res => {
      if (res.code === 0) {
        this.setData({ provider: res.data });
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '加载服务人员详情失败', icon: 'none' });
    });
  },

  handleDisable: function () {
    if (this.data.provider.disabled) {
      wx.showToast({ title: '该服务人员已被禁用', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认禁用',
      content: '禁用后该服务人员将无法登录，确定继续吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/providers/${this.data.provider.id}/disable`,
            method: 'PUT'
          }).then((result) => {
            if (result.code === 0) {
              wx.showToast({ title: '禁用成功', icon: 'success' });
              setTimeout(() => wx.navigateBack(), 1500);
            } else {
              wx.showToast({ title: result.message, icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '禁用失败', icon: 'none' });
          });
        }
      }
    });
  },

  handleEnable: function () {
    if (!this.data.provider.disabled) {
      wx.showToast({ title: '该服务人员未被禁用', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认启用',
      content: '启用后该服务人员可重新登录接单，确定继续吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/providers/${this.data.provider.id}/enable`,
            method: 'PUT'
          }).then((result) => {
            if (result.code === 0) {
              wx.showToast({ title: '启用成功', icon: 'success' });
              this.loadProvider(this.data.provider.id);
            } else {
              wx.showToast({ title: result.message, icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '启用失败', icon: 'none' });
          });
        }
      }
    });
  },

  handleDelete: function () {
    wx.showModal({
      title: '确认删除',
      content: '删除后该服务人员账号将被永久移除，此操作不可恢复，确定继续吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/providers/${this.data.provider.id}`,
            method: 'DELETE'
          }).then(res => {
            if (res.code === 0) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              wx.showToast({ title: res.message, icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  getLevelColor: function (level) {
    const colors = {
      1: '#d9d9d9',
      2: '#faad14',
      3: '#ff6b6b'
    };
    return colors[level] || '#d9d9d9';
  },

  getStatusText: function (status) {
    const texts = {
      idle: '空闲',
      busy: '忙碌',
      offline: '离线',
      disabled: '已禁用'
    };
    return texts[status] || '离线';
  }
});
