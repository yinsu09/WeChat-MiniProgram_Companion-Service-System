const app = getApp();

Page({
  data: {
    isEdit: false,
    serviceType: {
      id: 0,
      name: '',
      icon: '🏥',
      description: '',
      sort_order: 1,
      status: 1,
      level_price_ranges: {
        0: { min: 30, max: 80 },
        1: { min: 50, max: 120 },
        2: { min: 80, max: 200 },
        3: { min: 120, max: 500 }
      }
    },
    levelLabels: ['新手服务', '铜牌服务', '银牌服务', '金牌服务'],
    iconOptions: [
      { icon: '🏥' }, { icon: '👩‍⚕️' }, { icon: '🎮' }, { icon: '🍽️' },
      { icon: '🚗' }, { icon: '📚' }, { icon: '💬' }, { icon: '🗺️' },
      { icon: '🎭' }, { icon: '🎨' }, { icon: '🎵' }, { icon: '⛺' },
      { icon: '🏃' }, { icon: '🧘' }, { icon: '👨‍💼' }, { icon: '📞' }
    ]
  },

  onLoad: function (options) {
    if (options && options.id) {
      this.setData({ isEdit: false });
      this.loadType(options.id);
    } else {
      this.setData({ isEdit: true });
    }
  },

  loadType: function (id) {
    app.request({
      url: `/admin/service-types/${id}`
    }).then(res => {
      if (res.code === 0) {
        const serviceType = res.data;
        let ranges = serviceType.level_price_ranges;
        if (typeof ranges === 'string') {
          try { ranges = JSON.parse(ranges); } catch (_) { ranges = null; }
        }
        serviceType.level_price_ranges = ranges || this.data.serviceType.level_price_ranges;
        this.setData({ serviceType });
      }
    }).catch(() => {
      console.log('加载服务类型详情失败');
    });
  },

  onLevelPriceInput: function (e) {
    const level = e.currentTarget.dataset.level;
    const field = e.currentTarget.dataset.field;
    const value = parseFloat(e.detail.value) || 0;
    const key = `serviceType.level_price_ranges.${level}.${field}`;
    this.setData({ [key]: value });
  },

  onNameInput: function (e) {
    this.setData({ 'serviceType.name': e.detail.value });
  },

  onDescriptionInput: function (e) {
    this.setData({ 'serviceType.description': e.detail.value });
  },

  onSortOrderInput: function (e) {
    this.setData({ 'serviceType.sort_order': parseInt(e.detail.value) || 1 });
  },

  selectIcon: function (e) {
    const icon = e.currentTarget.dataset.icon;
    this.setData({ 'serviceType.icon': icon });
  },

  selectStatus: function (e) {
    const status = parseInt(e.currentTarget.dataset.status);
    this.setData({ 'serviceType.status': status });
  },

  switchToEdit: function () {
    this.setData({ isEdit: true });
  },

  handleSave: function () {
    const serviceType = this.data.serviceType;
    
    if (!serviceType.name) {
      wx.showToast({ title: '请输入类型名称', icon: 'none' });
      return;
    }

    const url = serviceType.id ? `/admin/service-types/${serviceType.id}` : '/admin/service-types';
    const method = serviceType.id ? 'PUT' : 'POST';

    app.request({
      url,
      method,
      data: serviceType
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  handleDelete: function () {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该服务类型吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/service-types/${this.data.serviceType.id}`,
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
  }
});