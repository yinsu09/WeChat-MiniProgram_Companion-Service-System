const app = getApp();

Page({
  data: {
    orderId: 0,
    order: {
      service_name: '',
      type_name: '',
      service_type: '',
      service_time: '',
      address: '',
      service_id: null,
      type_id: null
    },
    providers: [],
    searchKeyword: '',
    currentLevel: '',
    selectedProvider: 0,
    selectedProviderName: '',
    levelOptions: [
      { level: '', name: '全部' },
      { level: 0, name: '新手' },
      { level: 1, name: '铜牌' },
      { level: 2, name: '银牌' },
      { level: 3, name: '金牌' }
    ]
  },

  onLoad: function (options) {
    if (options && options.id) {
      this.setData({ orderId: options.id });
      this.loadOrder(options.id);
    }
  },

  loadOrder: function (id) {
    app.request({ url: `/admin/orders/${id}` }).then((res) => {
      if (res.code === 0 && res.data) {
        const order = res.data;
        this.setData({
          order: {
            ...order,
            service_name: order.service_name || '',
            type_name: order.type_name || order.service_type || '',
            service_type: order.type_name || order.service_type || '',
            service_time: `${order.scheduled_date || ''} ${order.scheduled_time || ''}`.trim(),
            address: order.service_area || order.service_desc || '未填写',
            service_id: order.service_id,
            type_id: order.type_id
          }
        });
        this.loadProviders();
      }
    }).catch(() => {
      wx.showToast({ title: '加载订单失败', icon: 'none' });
    });
  },

  loadProviders: function () {
    const params = { service_id: this.data.order.service_id };
    if (this.data.currentLevel !== '') {
      params.level = this.data.currentLevel;
    }
    if (this.data.searchKeyword) {
      params.keyword = this.data.searchKeyword;
    }

    app.request({
      url: '/admin/providers/available',
      data: params
    }).then((res) => {
      if (res.code === 0) {
        const providers = (res.data || []).map((item) => ({
          ...item,
          avatar_url: app.resolveImageUrl(item.avatar_url)
        }));
        this.setData({ providers });
      } else {
        this.setData({ providers: [] });
      }
    }).catch(() => {
      this.setData({ providers: [] });
    });
  },

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
    this.loadProviders();
  },

  filterByLevel: function (e) {
    const level = e.currentTarget.dataset.level;
    this.setData({ currentLevel: level === '' ? '' : level });
    this.loadProviders();
  },

  selectProvider: function (e) {
    const id = e.currentTarget.dataset.id;
    const provider = this.data.providers.find((p) => p.id === id);
    this.setData({
      selectedProvider: id,
      selectedProviderName: provider ? provider.nickname : ''
    });
  },

  confirmAssign: function () {
    if (!this.data.selectedProvider) {
      wx.showToast({ title: '请选择服务人员', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认指派',
      content: `确定将订单指派给 ${this.data.selectedProviderName} 吗？`,
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/orders/${this.data.orderId}/assign`,
            method: 'PUT',
            data: { provider_id: this.data.selectedProvider }
          }).then((result) => {
            if (result.code === 0) {
              wx.showToast({ title: '指派成功', icon: 'success' });
              setTimeout(() => wx.navigateBack(), 1500);
            } else {
              wx.showToast({ title: result.message || '指派失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '指派失败', icon: 'none' });
          });
        }
      }
    });
  },

  getLevelColor: function (level) {
    const colors = { 0: '#91d5ff', 1: '#d9d9d9', 2: '#faad14', 3: '#ff6b6b' };
    return colors[level] || '#d9d9d9';
  },

  getStatusText: function (status) {
    const texts = { idle: '空闲', busy: '忙碌', offline: '离线' };
    return texts[status] || '空闲';
  }
});
