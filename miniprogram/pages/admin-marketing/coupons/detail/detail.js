const app = getApp();

Page({
  data: {
    isEdit: false,
    coupon: {
      id: 0,
      name: '',
      description: '',
      amount: '',
      min_amount: '',
      total: '',
      start_time: '',
      end_time: '',
      service_types: [],
      user_limit: 1,
      status: 'active',
      type: 0,
      points_cost: 0
    },
    serviceTypes: [],
    selectedTypes: [],
    typeOptions: [
      { value: 0, label: '满减券' },
      { value: 2, label: '折扣券' }
    ],
    typeIndex: 0,
    statusOptions: [
      { value: 'active', label: '立即生效' },
      { value: 'inactive', label: '暂不生效' }
    ],
    statusIndex: 0
  },

  onLoad: function (options) {
    this.loadServiceTypes();
    if (options && options.id) {
      this.setData({ isEdit: true });
      this.loadCoupon(options.id);
    }
  },

  loadServiceTypes: function () {
    app.request({
      url: '/admin/service-types/all'
    }).then(res => {
      if (res.code === 0) {
        let types = res.data.filter(t => t.status === 1);
        types = types.map(t => ({
          ...t,
          id: parseInt(t.id),
          isSelected: false
        }));
        this.setData({ serviceTypes: types });
        if (this.data.selectedTypes.length > 0) {
          this.updateServiceTypeSelections();
        }
      }
    }).catch(() => {
      console.log('加载服务类型失败');
    });
  },

  updateServiceTypeSelections: function () {
    const types = this.data.serviceTypes.map(t => ({
      ...t,
      isSelected: this.data.selectedTypes.indexOf(t.id) > -1
    }));
    this.setData({ serviceTypes: types });
  },

  formatDate: function (dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('T') || dateStr.includes('Z')) {
      return dateStr.split('T')[0] || dateStr.split(' ')[0];
    }
    return dateStr;
  },

  loadCoupon: function (id) {
    app.request({
      url: `/admin/marketing/coupons/${id}`
    }).then(res => {
      if (res.code === 0) {
        const data = res.data;
        let serviceTypes = [];
        if (data.service_types) {
          try {
            serviceTypes = JSON.parse(data.service_types);
          } catch (e) {
            serviceTypes = [];
          }
        }
        const numericTypes = serviceTypes.map(t => parseInt(t)).filter(t => !isNaN(t));

        this.setData({
          coupon: {
            id: data.id,
            name: data.name,
            description: data.description || '',
            amount: data.discount_value || '',
            min_amount: data.min_amount || '',
            total: data.total_count || '',
            start_time: this.formatDate(data.valid_start),
            end_time: this.formatDate(data.valid_end),
            service_types: numericTypes,
            user_limit: data.user_limit || 1,
            status: data.status === 1 ? 'active' : 'inactive',
            type: data.type !== undefined ? data.type : 0,
            points_cost: data.points_cost || 0
          },
          selectedTypes: numericTypes,
          typeIndex: this.data.typeOptions.findIndex(t => t.value === (data.type !== undefined ? data.type : 0)),
          statusIndex: this.data.statusOptions.findIndex(s => s.value === (data.status === 1 ? 'active' : 'inactive'))
        });

        setTimeout(() => {
          this.updateServiceTypeSelections();
        }, 300);
      }
    }).catch(() => {
      console.log('加载优惠券失败');
    });
  },

  onNameInput: function (e) {
    this.setData({ 'coupon.name': e.detail.value });
  },

  onDescInput: function (e) {
    this.setData({ 'coupon.description': e.detail.value });
  },

  onAmountInput: function (e) {
    this.setData({ 'coupon.amount': e.detail.value });
  },

  onMinAmountInput: function (e) {
    this.setData({ 'coupon.min_amount': e.detail.value });
  },

  onTotalInput: function (e) {
    this.setData({ 'coupon.total': e.detail.value });
  },

  onPointsCostInput: function (e) {
    this.setData({ 'coupon.points_cost': e.detail.value });
  },

  onStartDateChange: function (e) {
    this.setData({ 'coupon.start_time': e.detail.value });
  },

  onEndDateChange: function (e) {
    this.setData({ 'coupon.end_time': e.detail.value });
  },

  onTypeChange: function (e) {
    const index = e.detail.value;
    this.setData({
      typeIndex: index,
      'coupon.type': this.data.typeOptions[index].value
    });
  },

  toggleServiceType: function (e) {
    const id = parseInt(e.currentTarget.dataset.id);
    console.log('点击服务类型:', id, '当前选中:', this.data.selectedTypes);

    const types = this.data.selectedTypes.slice();
    const index = types.indexOf(id);

    if (index > -1) {
      types.splice(index, 1);
    } else {
      types.push(id);
    }

    console.log('更新后选中:', types);

    this.setData({
      selectedTypes: types,
      'coupon.service_types': types
    });

    this.updateServiceTypeSelections();
  },

  setUserLimit: function (e) {
    const limit = parseInt(e.currentTarget.dataset.limit);
    this.setData({ 'coupon.user_limit': limit });
  },

  onStatusChange: function (e) {
    const index = e.detail.value;
    this.setData({
      statusIndex: index,
      'coupon.status': this.data.statusOptions[index].value
    });
  },

  saveCoupon: function () {
    if (!this.data.coupon.name) {
      wx.showToast({ title: '请输入优惠券名称', icon: 'none' });
      return;
    }
    if (!this.data.coupon.amount) {
      wx.showToast({ title: '请输入优惠券金额', icon: 'none' });
      return;
    }
    if (!this.data.coupon.start_time) {
      wx.showToast({ title: '请选择开始日期', icon: 'none' });
      return;
    }
    if (!this.data.coupon.end_time) {
      wx.showToast({ title: '请选择结束日期', icon: 'none' });
      return;
    }

    const url = this.data.isEdit
      ? `/admin/marketing/coupons/${this.data.coupon.id}`
      : '/admin/marketing/coupons';
    const method = this.data.isEdit ? 'PUT' : 'POST';

    const data = {
      name: this.data.coupon.name,
      type: this.data.coupon.type,
      discount_value: parseFloat(this.data.coupon.amount),
      min_amount: parseFloat(this.data.coupon.min_amount) || 0,
      valid_start: this.formatDate(this.data.coupon.start_time),
      valid_end: this.formatDate(this.data.coupon.end_time),
      total_count: parseInt(this.data.coupon.total) || 100,
      service_types: JSON.stringify(this.data.coupon.service_types),
      status: this.data.coupon.status === 'active' ? 1 : 0,
      description: this.data.coupon.description || '',
      points_cost: parseInt(this.data.coupon.points_cost, 10) || 0
    };

    app.request({
      url: url,
      method: method,
      data: data
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

  deleteCoupon: function () {
    wx.showModal({
      title: '删除优惠券',
      content: '确定要删除该优惠券吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/marketing/coupons/${this.data.coupon.id}`,
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