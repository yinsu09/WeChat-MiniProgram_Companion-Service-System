const app = getApp();

const DEFAULT_WEEKDAYS = [
  { id: 1, name: '周一', selected: true },
  { id: 2, name: '周二', selected: true },
  { id: 3, name: '周三', selected: true },
  { id: 4, name: '周四', selected: true },
  { id: 5, name: '周五', selected: true },
  { id: 6, name: '周六', selected: false },
  { id: 0, name: '周日', selected: false }
];

const DEFAULT_TIMESLOTS = [
  { id: 1, name: '09:00-12:00', selected: true },
  { id: 2, name: '12:00-14:00', selected: false },
  { id: 3, name: '14:00-17:00', selected: true },
  { id: 4, name: '17:00-20:00', selected: false }
];

Page({
  data: {
    serviceId: null,
    name: '',
    description: '',
    type_id: null,
    typeIndex: 0,
    serviceTypes: [],
    serviceTypeNames: [],
    currentTypeName: '',
    base_price: '',
    duration: '60',
    service_area: '',
    card_type: 1,
    card_count: '5',
    cover_image: '',
    images: [],
    weekdays: [],
    timeSlots: [],
    isLoaded: false,
    uploading: false,
    priceRangeHint: ''
  },

  onLoad: function (options) {
    this.setData({
      weekdays: JSON.parse(JSON.stringify(DEFAULT_WEEKDAYS)),
      timeSlots: JSON.parse(JSON.stringify(DEFAULT_TIMESLOTS))
    });

    if (options && options.id) {
      this.setData({ serviceId: parseInt(options.id, 10) });
    }

    this.loadServiceTypes();
  },

  loadServiceTypes: function () {
    app.request({ url: '/provider/service-types' }).then((res) => {
      if (res.code === 0 && res.data && res.data.length > 0) {
        const serviceTypes = res.data.filter((t) => t && t.id !== undefined && t.name);
        const serviceTypeNames = serviceTypes.map((t) => (
          t.status === 0 ? `${t.name}(已禁用)` : t.name
        ));
        this.setData({ serviceTypes, serviceTypeNames });
      }
      this.setDefaultType();
      this.setData({ isLoaded: true });
      if (this.data.serviceId) {
        this.loadService(this.data.serviceId);
      } else if (this.data.type_id) {
        this.loadPriceRange(this.data.type_id);
      }
    }).catch(() => {
      this.setDefaultType();
      this.setData({ isLoaded: true });
      if (this.data.serviceId) {
        this.loadService(this.data.serviceId);
      } else if (this.data.type_id) {
        this.loadPriceRange(this.data.type_id);
      }
    });
  },

  setDefaultType: function () {
    const types = this.data.serviceTypes;
    if (!types || !types.length) return;
    const firstValidType = types[0];
    this.setData({
      type_id: firstValidType.id,
      typeIndex: 0,
      currentTypeName: firstValidType.status === 0 ? `${firstValidType.name}(已禁用)` : firstValidType.name
    });
  },

  loadService: function (id) {
    app.request({ url: `/provider/my-services?id=${id}` }).then((res) => {
      if (res.code !== 0 || !res.data) return;

      const service = res.data;
      const types = this.data.serviceTypes;
      let typeIndex = 0;
      for (let i = 0; i < types.length; i += 1) {
        if (types[i].id == service.type_id) {
          typeIndex = i;
          break;
        }
      }

      const selectedType = types[typeIndex] || null;
      const imageList = service.image_list || [];
      const extraImages = imageList.slice(1);

      this.setData({
        name: service.name || '',
        description: service.description || '',
        type_id: service.type_id || null,
        typeIndex,
        currentTypeName: selectedType ? (selectedType.status === 0 ? `${selectedType.name}(已禁用)` : selectedType.name) : '',
        base_price: service.base_price ? String(service.base_price) : '',
        duration: service.duration ? String(service.duration) : '60',
        service_area: service.service_area || '',
        card_type: Number(service.card_type) === 2 ? 2 : 1,
        card_count: String(service.card_count || 5),
        cover_image: app.resolveImageUrl(service.cover_image || imageList[0] || ''),
        images: extraImages.map((url) => app.resolveImageUrl(url)),
        weekdays: this.processWeekdays(service.weekdays),
        timeSlots: this.processTimeSlots(service.time_slots)
      });
      if (service.type_id) {
        this.loadPriceRange(service.type_id);
      }
    }).catch(() => {
      wx.showToast({ title: '加载服务信息失败', icon: 'none' });
    });
  },

  processWeekdays: function (weekdaysJson) {
    let weekdaysData = [];
    if (weekdaysJson) {
      try {
        weekdaysData = typeof weekdaysJson === 'string' ? JSON.parse(weekdaysJson) : weekdaysJson;
      } catch (_) {
        weekdaysData = [];
      }
    }
    return DEFAULT_WEEKDAYS.map((w) => ({
      id: w.id,
      name: w.name,
      selected: Array.isArray(weekdaysData) && weekdaysData.includes(w.id)
    }));
  },

  processTimeSlots: function (timeSlotsJson) {
    let slotsData = [];
    if (timeSlotsJson) {
      try {
        slotsData = typeof timeSlotsJson === 'string' ? JSON.parse(timeSlotsJson) : timeSlotsJson;
      } catch (_) {
        slotsData = [];
      }
    }
    return DEFAULT_TIMESLOTS.map((s) => ({
      id: s.id,
      name: s.name,
      selected: Array.isArray(slotsData) && slotsData.includes(s.id)
    }));
  },

  onNameChange: function (e) { this.setData({ name: e.detail.value }); },
  onDescChange: function (e) { this.setData({ description: e.detail.value }); },
  onPriceChange: function (e) { this.setData({ base_price: e.detail.value }); },
  onDurationChange: function (e) { this.setData({ duration: e.detail.value }); },
  onAreaChange: function (e) { this.setData({ service_area: e.detail.value }); },
  onCardCountChange: function (e) { this.setData({ card_count: e.detail.value }); },

  onTypeChange: function (e) {
    const index = parseInt(e.detail.value, 10);
    const type = this.data.serviceTypes[index];
    if (!type) return;
    this.setData({
      typeIndex: index,
      type_id: type.id,
      currentTypeName: type.status === 0 ? `${type.name}(已禁用)` : type.name
    });
    this.loadPriceRange(type.id);
  },

  loadPriceRange: function (typeId) {
    if (!typeId) return;
    app.request({
      url: '/provider/price-range',
      data: { type_id: typeId }
    }).then((res) => {
      if (res.code === 0 && res.data) {
        const { level_name, min, max } = res.data;
        this.setData({
          priceRangeHint: `${level_name}定价区间：¥${min} - ¥${max}`
        });
      }
    }).catch(() => {});
  },

  selectCardType: function (e) {
    const cardType = parseInt(e.currentTarget.dataset.type, 10);
    this.setData({ card_type: cardType });
  },

  chooseCoverImage: function () {
    if (this.data.uploading) return;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.uploadImages([res.tempFilePaths[0]], 'cover');
      }
    });
  },

  chooseExtraImages: function () {
    if (this.data.uploading) return;
    const remain = 3 - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传3张图片', icon: 'none' });
      return;
    }
    wx.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.uploadImages(res.tempFilePaths, 'extra');
      }
    });
  },

  uploadImages: function (paths, type) {
    this.setData({ uploading: true });
    wx.showLoading({ title: '上传中...' });

    const tasks = paths.map((path) => app.uploadImage(path));
    Promise.all(tasks).then((urls) => {
      if (type === 'cover') {
        this.setData({ cover_image: urls[0] });
      } else {
        this.setData({ images: this.data.images.concat(urls).slice(0, 3) });
      }
      wx.showToast({ title: '上传成功', icon: 'success' });
    }).catch(() => {
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    }).finally(() => {
      wx.hideLoading();
      this.setData({ uploading: false });
    });
  },

  removeExtraImage: function (e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const images = this.data.images.filter((_, i) => i !== index);
    this.setData({ images });
  },

  toggleWeekday: function (e) {
    const id = e.currentTarget.dataset.id;
    const weekdays = this.data.weekdays.map((w) => (
      w.id == id ? { ...w, selected: !w.selected } : w
    ));
    this.setData({ weekdays });
  },

  toggleTimeSlot: function (e) {
    const id = e.currentTarget.dataset.id;
    const timeSlots = this.data.timeSlots.map((s) => (
      s.id == id ? { ...s, selected: !s.selected } : s
    ));
    this.setData({ timeSlots });
  },

  saveService: function () {
    if (!this.data.isLoaded) {
      wx.showToast({ title: '数据加载中，请稍候', icon: 'none' });
      return;
    }

    const {
      name, type_id, base_price, weekdays, timeSlots, card_type, card_count, cover_image, images
    } = this.data;

    if (!name.trim()) {
      wx.showToast({ title: '请输入服务名称', icon: 'none' });
      return;
    }
    if (!type_id) {
      wx.showToast({ title: '请选择服务类型', icon: 'none' });
      return;
    }
    if (!base_price || parseFloat(base_price) <= 0) {
      wx.showToast({ title: '请输入有效价格', icon: 'none' });
      return;
    }
    if (card_type === 2 && (!card_count || parseInt(card_count, 10) < 2)) {
      wx.showToast({ title: '多次卡次数至少为2', icon: 'none' });
      return;
    }

    const selectedWeekdays = weekdays.filter((w) => w.selected).map((w) => w.id);
    const selectedSlots = timeSlots.filter((s) => s.selected).map((s) => s.id);

    if (!selectedWeekdays.length) {
      wx.showToast({ title: '请至少选择一天服务日期', icon: 'none' });
      return;
    }
    if (!selectedSlots.length) {
      wx.showToast({ title: '请至少选择一个服务时段', icon: 'none' });
      return;
    }

    const data = {
      name: name.trim(),
      description: this.data.description || '',
      type_id,
      base_price: parseFloat(base_price),
      duration: parseInt(this.data.duration, 10) || 60,
      service_area: this.data.service_area || '',
      weekdays: selectedWeekdays,
      time_slots: selectedSlots,
      card_type,
      card_count: card_type === 2 ? parseInt(card_count, 10) : 1,
      cover_image: cover_image || '',
      images: JSON.stringify(images || [])
    };

    if (this.data.serviceId) {
      data.id = this.data.serviceId;
    }

    app.request({
      url: '/provider/my-services',
      method: this.data.serviceId ? 'PUT' : 'POST',
      data
    }).then((res) => {
      if (res.code === 0) {
        wx.showToast({ title: this.data.serviceId ? '修改成功' : '发布成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  }
});
