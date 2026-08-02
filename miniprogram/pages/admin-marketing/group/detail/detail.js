const app = getApp();

Page({
  data: {
    isEdit: false,
    viewOnly: false,
    group: {
      id: 0,
      name: '',
      description: '',
      location: '',
      start_time: '',
      start_hour: '',
      duration: '',
      min_people: '',
      max_people: '',
      provider_id: '',
      service_types: [],
      price: '',
      status: 'active',
      notice: ''
    },
    providers: [],
    providerIndex: -1,
    selectedProviderId: '',
    serviceTypes: [],
    statusOptions: [
      { value: 'active', label: '招募中' },
      { value: 'inactive', label: '暂停招募' },
      { value: 'completed', label: '已结束' }
    ],
    statusIndex: 0
  },

  onLoad: function (options) {
    this.loadProviders();
    this.loadServiceTypes();
    if (options && options.id) {
      this.setData({ isEdit: true });
      this.loadGroup(options.id);
    }
  },

  loadProviders: function () {
    app.request({
      url: '/admin/providers/available'
    }).then(res => {
      if (res.code === 0) {
        this.setData({ providers: res.data });
      }
    }).catch(() => {
      console.log('加载服务人员失败');
    });
  },

  loadServiceTypes: function () {
    app.request({
      url: '/admin/service-types/all'
    }).then(res => {
      if (res.code === 0) {
        const types = res.data
          .filter(t => t.status === 1)
          .map(t => ({
            ...t,
            id: parseInt(t.id),
            isSelected: false
          }));
        this.setData({ serviceTypes: types });
        this.updateSelections();
      }
    }).catch(() => {
      console.log('加载服务类型失败');
    });
  },

  updateSelections: function () {
    const selectedIds = this.data.group.service_types || [];
    const types = this.data.serviceTypes.map(t => ({
      ...t,
      isSelected: selectedIds.includes(t.id)
    }));
    this.setData({ serviceTypes: types });
  },

  loadGroup: function (id) {
    app.request({
      url: `/admin/marketing/group/${id}`
    }).then(res => {
      if (res.code === 0) {
        const data = res.data;
        const serviceTypes = data.service_types ? data.service_types.map(t => parseInt(t)) : [];
        this.setData({ 
          group: {
            ...data,
            service_types: serviceTypes
          },
          viewOnly: !!data.viewOnly,
          selectedProviderId: '',
          providerIndex: -1,
          statusIndex: this.data.statusOptions.findIndex(s => s.value === data.status)
        });
        this.updateSelections();
      }
    }).catch(() => {
      console.log('使用默认数据');
    });
  },

  onNameInput: function (e) {
    this.setData({ 'group.name': e.detail.value });
  },

  onDescInput: function (e) {
    this.setData({ 'group.description': e.detail.value });
  },

  onLocationInput: function (e) {
    this.setData({ 'group.location': e.detail.value });
  },

  onStartDateChange: function (e) {
    this.setData({ 'group.start_time': e.detail.value });
  },

  onStartTimeChange: function (e) {
    this.setData({ 'group.start_hour': e.detail.value });
  },

  onDurationInput: function (e) {
    this.setData({ 'group.duration': e.detail.value });
  },

  onMinPeopleInput: function (e) {
    this.setData({ 'group.min_people': e.detail.value });
  },

  onMaxPeopleInput: function (e) {
    this.setData({ 'group.max_people': e.detail.value });
  },

  onProviderChange: function (e) {
    const index = e.detail.value;
    this.setData({ 
      providerIndex: index,
      selectedProviderId: this.data.providers[index].id
    });
  },

  inviteProvider: function () {
    if (!this.data.group.id) {
      wx.showToast({ title: '请先保存活动', icon: 'none' });
      return;
    }
    const providerId = this.data.selectedProviderId;
    if (!providerId) {
      wx.showToast({ title: '请选择服务人员', icon: 'none' });
      return;
    }

    app.request({
      url: `/admin/marketing/group/${this.data.group.id}/invite`,
      method: 'POST',
      data: { provider_id: providerId }
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '邀请已发送', icon: 'success' });
        this.loadGroup(this.data.group.id);
      } else {
        wx.showToast({ title: res.message || '发送失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '发送失败', icon: 'none' });
    });
  },

  toggleServiceType: function (e) {
    const id = parseInt(e.currentTarget.dataset.id);
    const types = [...this.data.group.service_types];
    const index = types.indexOf(id);
    if (index === -1) {
      types.push(id);
    } else {
      types.splice(index, 1);
    }
    this.setData({ 'group.service_types': types });
    this.updateSelections();
  },

  onPriceInput: function (e) {
    this.setData({ 'group.price': e.detail.value });
  },

  onNoticeInput: function (e) {
    this.setData({ 'group.notice': e.detail.value });
  },

  onStatusChange: function (e) {
    const index = e.detail.value;
    this.setData({ 
      statusIndex: index,
      'group.status': this.data.statusOptions[index].value
    });
  },

  succeedGroup: function () {
    if (!this.data.group.id) return;
    wx.showModal({
      title: '确认组团成功',
      content: '确定将该活动标记为组团成功吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/marketing/group/${this.data.group.id}/succeed`,
            method: 'POST'
          }).then((result) => {
            if (result.code === 0) {
              wx.showToast({ title: '组团成功', icon: 'success' });
              this.loadGroup(this.data.group.id);
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

  saveGroup: function () {
    if (this.data.viewOnly) {
      wx.showToast({ title: '活动已结束，仅可查看', icon: 'none' });
      return;
    }
    if (!this.data.group.name) {
      wx.showToast({ title: '请输入活动名称', icon: 'none' });
      return;
    }
    if (!this.data.group.location) {
      wx.showToast({ title: '请输入活动地点', icon: 'none' });
      return;
    }
    if (!this.data.group.price) {
      wx.showToast({ title: '请输入活动价格', icon: 'none' });
      return;
    }

    const url = this.data.isEdit 
      ? `/admin/marketing/group/${this.data.group.id}`
      : '/admin/marketing/group';
    const method = this.data.isEdit ? 'PUT' : 'POST';

    app.request({
      url: url,
      method: method,
      data: {
        ...this.data.group,
        provider_id: this.data.selectedProviderId || undefined
      }
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ 
          title: this.data.isEdit ? '修改成功' : '创建成功', 
          icon: 'success' 
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  deleteGroup: function () {
    wx.showModal({
      title: '删除活动',
      content: '确定要删除该组团游活动吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/marketing/group/${this.data.group.id}`,
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