const app = getApp();

Page({
  data: {
    providerInfo: null,
    name: '',
    phone: '',
    gender: 0,
    bio: '',
    stats: {
      totalOrders: 0,
      completedOrders: 0,
      avgRating: '0.0',
      serviceHours: 0
    },
    work_mode: 1,
    work_mode_text: '工作中',
    rest_periods: [],
    showRestModal: false,
    restStartDate: '',
    restStartTime: '09:00',
    restEndDate: '',
    restEndTime: '18:00'
  },

  onLoad: function () {
    app.switchRole('provider');
    this.loadProviderInfo();
  },

  loadProviderInfo: function () {
    app.request({
      url: '/provider/profile'
    }).then(res => {
      if (res.code === 0 && res.data) {
        this.applyProviderInfo(res.data);
      } else {
        this.loadLocalProviderInfo();
      }
    }).catch(() => {
      this.loadLocalProviderInfo();
    });
  },

  loadLocalProviderInfo: function () {
    const providerInfo = app.getSession('provider').userInfo || app.globalData.providerInfo;
    if (!providerInfo || !providerInfo.nickname) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    this.applyProviderInfo(providerInfo);
  },

  applyProviderInfo: function (providerInfo) {
    const session = app.getSession('provider');
    if (session.token) {
      app.setSession('provider', session.token, providerInfo);
    }

    const stats = { ...this.data.stats };
    if (providerInfo.service_count !== undefined) {
      stats.completedOrders = providerInfo.service_count;
    }
    if (providerInfo.rating) {
      stats.avgRating = providerInfo.rating;
    }

    this.setData({
      providerInfo,
      name: providerInfo.nickname || '',
      phone: providerInfo.phone || '',
      gender: providerInfo.gender || 0,
      bio: providerInfo.bio || '',
      stats,
      work_mode: providerInfo.work_mode != null ? providerInfo.work_mode : 1,
      work_mode_text: providerInfo.work_mode_text || (providerInfo.work_mode === 0 ? '休息中' : '工作中'),
      rest_periods: providerInfo.rest_periods || []
    });
  },

  onNameChange: function (e) {
    this.setData({ name: e.detail.value });
  },

  onBioChange: function (e) {
    this.setData({ bio: e.detail.value });
  },

  onGenderChange: function (e) {
    this.setData({ gender: parseInt(e.detail.value, 10) });
  },

  changeAvatar: function () {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        const providerInfo = this.data.providerInfo || {};
        providerInfo.avatar_url = tempFilePath;
        this.setData({ providerInfo });
        wx.showToast({ title: '头像已选择', icon: 'success' });
      }
    });
  },

  saveProfile: function () {
    const { name, bio, gender } = this.data;

    if (!name.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }

    if (!gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' });
      return;
    }

    const currentProvider = this.data.providerInfo || {};

    app.request({
      url: '/provider/info',
      method: 'PUT',
      data: {
        nickname: name,
        bio,
        gender,
        avatar_url: currentProvider.avatar_url || ''
      }
    }).then(res => {
      if (res.code === 0 && res.data) {
        const session = app.getSession('provider');
        if (session.token) {
          app.setSession('provider', session.token, res.data);
        }
        this.setData({ providerInfo: res.data });
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
      }
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }).catch(() => {
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  setWorkMode: function (e) {
    const mode = parseInt(e.currentTarget.dataset.mode, 10);
    app.request({
      url: '/provider/work-mode',
      method: 'PUT',
      data: { work_mode: mode }
    }).then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({
          work_mode: res.data.work_mode,
          work_mode_text: res.data.work_mode_text,
          rest_periods: res.data.rest_periods || []
        });
        wx.showToast({ title: res.message || '已更新', icon: 'success' });
      } else {
        wx.showToast({ title: res.message || '更新失败', icon: 'none' });
      }
    });
  },

  showAddRest: function () {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.setData({
      showRestModal: true,
      restStartDate: fmt(now),
      restEndDate: fmt(tomorrow)
    });
  },

  hideAddRest: function () {
    this.setData({ showRestModal: false });
  },

  onRestStartDateChange: function (e) { this.setData({ restStartDate: e.detail.value }); },
  onRestStartTimeChange: function (e) { this.setData({ restStartTime: e.detail.value }); },
  onRestEndDateChange: function (e) { this.setData({ restEndDate: e.detail.value }); },
  onRestEndTimeChange: function (e) { this.setData({ restEndTime: e.detail.value }); },

  confirmAddRest: function () {
    const { restStartDate, restStartTime, restEndDate, restEndTime } = this.data;
    app.request({
      url: '/provider/rest-periods',
      method: 'POST',
      data: {
        start_time: `${restStartDate} ${restStartTime}:00`,
        end_time: `${restEndDate} ${restEndTime}:00`
      }
    }).then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({
          showRestModal: false,
          rest_periods: res.data.rest_periods || [],
          work_mode_text: res.data.work_mode_text
        });
        wx.showToast({ title: '已添加', icon: 'success' });
      } else {
        wx.showToast({ title: res.message || '添加失败', icon: 'none' });
      }
    });
  },

  deleteRestPeriod: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除休息时段',
      content: '确定删除该休息时段吗？',
      success: (res) => {
        if (!res.confirm) return;
        app.request({
          url: `/provider/rest-periods/${id}`,
          method: 'DELETE'
        }).then((result) => {
          if (result.code === 0 && result.data) {
            this.setData({ rest_periods: result.data.rest_periods || [] });
            wx.showToast({ title: '已删除', icon: 'success' });
          }
        });
      }
    });
  }
});
