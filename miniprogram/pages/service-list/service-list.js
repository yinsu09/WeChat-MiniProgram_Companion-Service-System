const app = getApp();

Page({
  data: {
    typeId: 0,
    typeName: '',
    services: [],
    totalCount: 0
  },

  onLoad: function (options) {
    if (options && options.typeId) {
      this.setData({ typeId: parseInt(options.typeId) });
      this.loadTypeName();
      this.loadServices();
    }
  },

  loadTypeName: function () {
    app.request({
      url: '/services/types'
    }).then(res => {
      if (res.code === 0 && res.data) {
        const type = res.data.find(t => t.id === this.data.typeId);
        if (type) {
          this.setData({ typeName: type.name });
        }
      }
    }).catch(() => {
      console.log('加载服务类型名称失败');
    });
  },

  loadServices: function () {
    app.request({
      url: '/services',
      data: {
        type_id: this.data.typeId,
        page: 1,
        limit: 20
      }
    }).then(res => {
      if (res.code === 0 && res.data) {
        const services = Array.isArray(res.data) ? res.data : [];
        this.setData({ 
          services,
          totalCount: services.length
        });
      } else {
        this.setData({ 
          services: [],
          totalCount: 0
        });
      }
    }).catch(() => {
      this.setData({ 
        services: [],
        totalCount: 0
      });
    });
  },

  goToServiceDetail: function (e) {
    const serviceId = e.currentTarget.dataset.serviceId;
    wx.navigateTo({
      url: `/pages/service-detail/service-detail?id=${serviceId}`
    });
  }
});
