const app = getApp();

Page({
  data: {
    services: [],
    groupTours: [],
    completedGroupTours: [],
    serviceTypes: {}
  },

  onLoad: function () {
    this.loadMyServices();
    this.loadGroupTours();
    this.loadServiceTypes();
  },

  onShow: function () {
    this.loadMyServices();
    this.loadGroupTours();
  },

  loadMyServices: function () {
    app.request({
      url: '/provider/my-services'
    }).then(res => {
      if (res.code === 0 && res.data && Array.isArray(res.data)) {
        this.setData({ services: res.data });
      } else {
        this.setData({ services: [] });
      }
    }).catch(() => {
      this.setData({ services: [] });
    });
  },

  loadGroupTours: function () {
    app.request({
      url: '/provider/group-tours'
    }).then(res => {
      if (res.code === 0 && res.data) {
        const payload = res.data;
        if (Array.isArray(payload)) {
          this.setData({ groupTours: payload, completedGroupTours: [] });
        } else {
          this.setData({
            groupTours: payload.ongoing || [],
            completedGroupTours: payload.completed || []
          });
        }
      } else {
        this.setData({ groupTours: [], completedGroupTours: [] });
      }
    }).catch(() => {
      this.setData({ groupTours: [], completedGroupTours: [] });
    });
  },

  loadServiceTypes: function () {
    app.request({
      url: '/services/types'
    }).then(res => {
      if (res.code === 0 && res.data) {
        const types = {};
        res.data.forEach(t => {
          types[t.id] = t.name;
        });
        this.setData({ serviceTypes: types });
      }
    }).catch(() => {});
  },

  goToAddService: function () {
    wx.navigateTo({
      url: '/pages/provider-service-edit/provider-service-edit'
    });
  },

  goToEditService: function (e) {
    const serviceId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/provider-service-edit/provider-service-edit?id=${serviceId}`
    });
  },

  toggleServiceStatus: function (e) {
    const serviceId = e.currentTarget.dataset.id;
    const currentStatus = e.currentTarget.dataset.status;
    const newStatus = currentStatus === 1 ? 0 : 1;
    const actionText = newStatus === 1 ? '上架' : '下架';

    wx.showModal({
      title: '确认' + actionText,
      content: '确定要' + (newStatus === 1 ? '上架' : '下架') + '该服务吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: '/provider/my-services/status',
            method: 'PUT',
            data: { id: serviceId, status: newStatus }
          }).then(res => {
            if (res.code === 0) {
              wx.showToast({ title: actionText + '成功', icon: 'success' });
              this.loadMyServices();
            } else {
              wx.showToast({ title: actionText + '失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: actionText + '失败', icon: 'none' });
          });
        }
      }
    });
  },

  deleteService: function (e) {
    const serviceId = e.currentTarget.dataset.id;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除该服务吗？删除后无法恢复！',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: '/provider/my-services?id=' + serviceId,
            method: 'DELETE'
          }).then(res => {
            if (res.code === 0) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              this.loadMyServices();
            } else {
              wx.showToast({ title: res.message || '删除失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  acceptGroupTour: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '接受邀请',
      content: '确定接受该组团游的带团邀请吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/provider/group-tours/${id}/accept`,
            method: 'POST'
          }).then(result => {
            if (result.code === 0) {
              wx.showToast({ title: '已接受', icon: 'success' });
              this.loadGroupTours();
            } else {
              wx.showToast({ title: result.message || '操作失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
  },

  rejectGroupTour: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '拒绝邀请',
      content: '确定拒绝该组团游的带团邀请吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/provider/group-tours/${id}/reject`,
            method: 'POST'
          }).then(result => {
            if (result.code === 0) {
              wx.showToast({ title: '已拒绝', icon: 'success' });
              this.loadGroupTours();
            } else {
              wx.showToast({ title: result.message || '操作失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
  },

  exitGroupTour: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '退出组团游',
      content: '退出后该活动将变为暂无服务人员，确定退出吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/provider/group-tours/${id}/exit`,
            method: 'POST'
          }).then(result => {
            if (result.code === 0) {
              wx.showToast({ title: '已退出', icon: 'success' });
              this.loadGroupTours();
            } else {
              wx.showToast({ title: result.message || '操作失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
  },

  getStatusText: function (status) {
    return status === 1 ? '上架中' : '已下架';
  },

  getStatusColor: function (status) {
    return status === 1 ? '#52c41a' : '#999';
  }
});
