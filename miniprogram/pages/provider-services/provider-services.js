const app = getApp();

Page({
  data: {
    serviceTypes: [],
    weekdays: [],
    timeSlots: [],
    serviceArea: ''
  },

  onLoad: function () {
    this.loadServiceSettings();
  },

  loadServiceSettings: function () {
    const providerId = app.globalData.providerInfo ? app.globalData.providerInfo.id : 1;

    app.request({
      url: '/provider/services',
      data: { provider_id: providerId }
    }).then(res => {
      if (res.code === 0 && res.data) {
        this.setData(res.data);
      } else {
        this.setData(this.getDefaultSettings());
      }
    }).catch(() => {
      this.setData(this.getDefaultSettings());
    });
  },

  getDefaultSettings: function () {
    return {
      serviceTypes: [
        { id: 1, name: '陪诊', icon: '🏥', selected: true },
        { id: 2, name: '陪护', icon: '🛏️', selected: true },
        { id: 3, name: '陪玩', icon: '🎮', selected: false },
        { id: 4, name: '陪吃', icon: '🍽️', selected: false },
        { id: 5, name: '陪游', icon: '🗺️', selected: false },
        { id: 6, name: '陪学', icon: '📚', selected: false },
        { id: 7, name: '陪聊', icon: '💬', selected: false }
      ],
      weekdays: [
        { id: 1, name: '周一', selected: true },
        { id: 2, name: '周二', selected: true },
        { id: 3, name: '周三', selected: true },
        { id: 4, name: '周四', selected: true },
        { id: 5, name: '周五', selected: true },
        { id: 6, name: '周六', selected: false },
        { id: 0, name: '周日', selected: false }
      ],
      timeSlots: [
        { id: 1, name: '09:00-12:00', selected: true },
        { id: 2, name: '12:00-14:00', selected: false },
        { id: 3, name: '14:00-17:00', selected: true },
        { id: 4, name: '17:00-20:00', selected: true }
      ],
      serviceArea: '北京市朝阳区、海淀区、东城区'
    };
  },

  getMockData: function () {
    return this.getDefaultSettings();
  },

  toggleServiceType: function (e) {
    const id = e.currentTarget.dataset.id;
    const serviceTypes = this.data.serviceTypes.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected };
      }
      return item;
    });
    this.setData({ serviceTypes });
  },

  toggleWeekday: function (e) {
    const id = e.currentTarget.dataset.id;
    const weekdays = this.data.weekdays.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected };
      }
      return item;
    });
    this.setData({ weekdays });
  },

  toggleTimeSlot: function (e) {
    const id = e.currentTarget.dataset.id;
    const timeSlots = this.data.timeSlots.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected };
      }
      return item;
    });
    this.setData({ timeSlots });
  },

  onAreaChange: function (e) {
    this.setData({ serviceArea: e.detail.value });
  },

  saveServices: function () {
    const selectedTypes = this.data.serviceTypes.filter(t => t.selected);
    const selectedWeekdays = this.data.weekdays.filter(w => w.selected);
    const selectedSlots = this.data.timeSlots.filter(s => s.selected);

    if (selectedTypes.length === 0) {
      wx.showToast({ title: '请至少选择一项服务类型', icon: 'none' });
      return;
    }

    if (selectedWeekdays.length === 0) {
      wx.showToast({ title: '请至少选择一天', icon: 'none' });
      return;
    }

    if (selectedSlots.length === 0) {
      wx.showToast({ title: '请至少选择一个时间段', icon: 'none' });
      return;
    }

    app.request({
      url: '/provider/services',
      method: 'PUT',
      data: {
        service_types: selectedTypes.map(t => t.id),
        weekdays: selectedWeekdays.map(w => w.id),
        time_slots: selectedSlots.map(s => s.id),
        service_area: this.data.serviceArea
      }
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  }
});
