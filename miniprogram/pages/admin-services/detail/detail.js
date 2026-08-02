const app = getApp();

Page({
  data: {
    category: 'regular',
    isEdit: false,
    service: {
      id: 0,
      name: '',
      type_id: 1,
      type_name: '',
      service_type: 'single',
      card_count: 5,
      duration: 60,
      description: '',
      instructions: '',
      cover_image: '',
      base_price: 0,
      statusKey: 'offline',
      statusText: '下架',
      level_prices: [
        { level: 1, level_name: '铜牌', price: 0 },
        { level: 2, level_name: '银牌', price: 0 },
        { level: 3, level_name: '金牌', price: 0 }
      ]
    },
    serviceTypes: []
  },

  onLoad: function (options) {
    const category = options.category || 'regular';
    this.setData({ category, isEdit: false });

    if (options && options.id) {
      this.loadService(options.id, category);
    } else {
      wx.showToast({ title: '无效的服务ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }

    this.loadServiceTypes();
  },

  loadServiceTypes: function () {
    app.request({ url: '/admin/service-types/all' }).then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({ serviceTypes: res.data });
      }
    }).catch(() => {});
  },

  loadService: function (id, category) {
    app.request({
      url: `/admin/services/${id}`,
      data: { category }
    }).then((res) => {
      if (res.code !== 0 || !res.data) {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
        return;
      }

      const data = res.data;
      if (category === 'custom' || category === 'group') {
        this.setData({ service: data });
        return;
      }

      let levelPrices = [
        { level: 1, level_name: '铜牌', price: data.base_price || 0 },
        { level: 2, level_name: '银牌', price: data.base_price || 0 },
        { level: 3, level_name: '金牌', price: data.base_price || 0 }
      ];
      if (data.level_prices && Array.isArray(data.level_prices)) {
        levelPrices = data.level_prices;
      }

      this.setData({
        service: {
          ...data,
          service_type: Number(data.card_type) === 2 ? 'card' : 'single',
          cover_image: app.resolveImageUrl(data.cover_image || (data.image_list && data.image_list[0]) || ''),
          image_list: (data.image_list || []).map((url) => app.resolveImageUrl(url)),
          statusKey: data.statusKey || (Number(data.status) === 1 ? 'online' : 'offline'),
          statusText: data.statusText || (Number(data.status) === 1 ? '上架' : '下架'),
          base_price: data.base_price || 0,
          level_prices: levelPrices
        }
      });
    }).catch(() => {
      wx.showToast({ title: '加载服务详情失败', icon: 'none' });
    });
  },

  onNameInput: function (e) {
    this.setData({ 'service.name': e.detail.value });
  },

  onDescriptionInput: function (e) {
    this.setData({ 'service.description': e.detail.value });
  },

  onInstructionsInput: function (e) {
    this.setData({ 'service.instructions': e.detail.value });
  },

  onCardCountInput: function (e) {
    this.setData({ 'service.card_count': parseInt(e.detail.value, 10) || 0 });
  },

  onDurationInput: function (e) {
    this.setData({ 'service.duration': parseInt(e.detail.value, 10) || 0 });
  },

  selectType: function (e) {
    const id = parseInt(e.currentTarget.dataset.id, 10);
    const name = e.currentTarget.dataset.name;
    this.setData({
      'service.type_id': id,
      'service.type_name': name
    });
  },

  selectMode: function (e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ 'service.service_type': mode });
  },

  onLevelPriceInput: function (e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const price = parseFloat(e.detail.value) || 0;
    const levelPrices = this.data.service.level_prices;
    levelPrices[index].price = price;
    this.setData({ 'service.level_prices': levelPrices });
  },

  selectStatus: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      'service.statusKey': status,
      'service.statusText': status === 'online' ? '上架' : '下架'
    });
  },

  uploadCover: function () {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        wx.showLoading({ title: '上传中...' });
        app.uploadImage(res.tempFilePaths[0]).then((url) => {
          this.setData({ 'service.cover_image': url });
          wx.showToast({ title: '上传成功', icon: 'success' });
        }).catch(() => {
          wx.showToast({ title: '上传失败', icon: 'none' });
        }).finally(() => wx.hideLoading());
      }
    });
  },

  getBasePrice: function () {
    return this.data.service.level_prices[0].price;
  },

  switchToEdit: function () {
    if (this.data.service.viewOnly) return;
    this.setData({ isEdit: true });
  },

  handleSave: function () {
    const service = this.data.service;

    if (!service.name) {
      wx.showToast({ title: '请输入服务名称', icon: 'none' });
      return;
    }

    const payload = {
      name: service.name,
      description: service.description,
      duration: service.duration,
      base_price: this.getBasePrice(),
      level_prices: service.level_prices,
      type_id: service.type_id,
      cover_image: service.cover_image,
      images: JSON.stringify((service.image_list || []).slice(1)),
      card_type: service.service_type === 'card' ? 2 : 1,
      card_count: service.service_type === 'card' ? (service.card_count || 2) : 1,
      status: service.statusKey === 'online' ? 1 : 0
    };

    app.request({
      url: `/admin/services/${service.id}`,
      method: 'PUT',
      data: payload
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
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
      content: '确定要删除该服务吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/services/${this.data.service.id}`,
            method: 'DELETE'
          }).then(res => {
            if (res.code === 0) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              setTimeout(() => wx.navigateBack(), 1500);
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
