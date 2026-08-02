const app = getApp();

Page({
  data: {
    isEdit: false,
    activity: {
      id: 0,
      name: '',
      description: '',
      start_time: '',
      end_time: '',
      gifts: [],
      condition: 'register',
      status: 'active'
    },
    giftTypes: [
      { value: 'coupon', label: '优惠券' },
      { value: 'gift', label: '积分' }
    ],
    statusOptions: [
      { value: 'active', label: '立即生效' },
      { value: 'inactive', label: '暂不生效' }
    ],
    statusIndex: 0
  },

  onLoad: function (options) {
    if (options && options.id) {
      this.setData({ isEdit: true });
      this.loadActivity(options.id);
    } else {
      this.addGift();
    }
  },

  loadActivity: function (id) {
    app.request({
      url: `/admin/marketing/newuser/${id}`
    }).then(res => {
      if (res.code === 0) {
        const data = res.data;
        data.gifts = data.gifts.map(g => {
          const type = g.type === 'gift' ? 'gift' : 'coupon';
          const typeIndex = this.data.giftTypes.findIndex(t => t.value === type);
          return {
            ...g,
            type,
            typeIndex: typeIndex >= 0 ? typeIndex : 0,
            quantity: g.quantity || 1
          };
        });
        this.setData({ 
          activity: data,
          statusIndex: this.data.statusOptions.findIndex(s => s.value === data.status)
        });
      }
    }).catch(() => {
      this.addGift();
    });
  },

  addGift: function () {
    const gifts = [...this.data.activity.gifts, {
      type: 'coupon',
      typeIndex: 0,
      name: '',
      amount: '',
      quantity: 1
    }];
    this.setData({ 'activity.gifts': gifts });
  },

  deleteGift: function (e) {
    const index = e.currentTarget.dataset.index;
    const gifts = this.data.activity.gifts.filter((_, i) => i !== index);
    this.setData({ 'activity.gifts': gifts });
  },

  onNameInput: function (e) {
    this.setData({ 'activity.name': e.detail.value });
  },

  onDescInput: function (e) {
    this.setData({ 'activity.description': e.detail.value });
  },

  onStartDateChange: function (e) {
    this.setData({ 'activity.start_time': e.detail.value });
  },

  onEndDateChange: function (e) {
    this.setData({ 'activity.end_time': e.detail.value });
  },

  onGiftTypeChange: function (e) {
    const index = e.currentTarget.dataset.index;
    const typeIndex = parseInt(e.detail.value, 10) || 0;
    const gifts = [...this.data.activity.gifts];
    gifts[index].typeIndex = typeIndex;
    gifts[index].type = this.data.giftTypes[typeIndex].value;
    if (gifts[index].type === 'gift' && !gifts[index].name) {
      gifts[index].name = '新人积分券';
    }
    this.setData({ 'activity.gifts': gifts });
  },

  onGiftNameInput: function (e) {
    const index = e.currentTarget.dataset.index;
    const gifts = [...this.data.activity.gifts];
    gifts[index].name = e.detail.value;
    this.setData({ 'activity.gifts': gifts });
  },

  onGiftAmountInput: function (e) {
    const index = e.currentTarget.dataset.index;
    const gifts = [...this.data.activity.gifts];
    gifts[index].amount = e.detail.value;
    this.setData({ 'activity.gifts': gifts });
  },

  onGiftQuantityInput: function (e) {
    const index = e.currentTarget.dataset.index;
    const gifts = [...this.data.activity.gifts];
    gifts[index].quantity = e.detail.value;
    this.setData({ 'activity.gifts': gifts });
  },

  setCondition: function (e) {
    const condition = e.currentTarget.dataset.condition;
    this.setData({ 'activity.condition': condition });
  },

  onStatusChange: function (e) {
    const index = e.detail.value;
    this.setData({ 
      statusIndex: index,
      'activity.status': this.data.statusOptions[index].value
    });
  },

  saveActivity: function () {
    if (!this.data.activity.name) {
      wx.showToast({ title: '请输入活动名称', icon: 'none' });
      return;
    }
    if (!this.data.activity.gifts.length) {
      wx.showToast({ title: '请添加礼包内容', icon: 'none' });
      return;
    }

    const url = this.data.isEdit 
      ? `/admin/marketing/newuser/${this.data.activity.id}`
      : '/admin/marketing/newuser';
    const method = this.data.isEdit ? 'PUT' : 'POST';

    // 处理日期格式：提取纯日期部分（YYYY-MM-DD）
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      if (dateStr.includes('T') || dateStr.includes('Z')) {
        return dateStr.split('T')[0] || dateStr.split(' ')[0];
      }
      return dateStr;
    };

    const activity = {
      name: this.data.activity.name,
      description: this.data.activity.description || '',
      start_time: formatDate(this.data.activity.start_time),
      end_time: formatDate(this.data.activity.end_time),
      gifts: this.data.activity.gifts.map(g => ({
        type: g.type === 'gift' ? 'gift' : 'coupon',
        name: g.name || (g.type === 'gift' ? '新人积分券' : ''),
        amount: g.amount || '0',
        quantity: parseInt(g.quantity, 10) > 0 ? parseInt(g.quantity, 10) : 1
      })),
      condition: this.data.activity.condition || 'register',
      status: this.data.activity.status || 'active'
    };

    app.request({
      url: url,
      method: method,
      data: activity
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

  deleteActivity: function () {
    wx.showModal({
      title: '删除活动',
      content: '确定要删除该新用户活动吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/marketing/newuser/${this.data.activity.id}`,
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