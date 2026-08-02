const app = getApp();

Page({
  data: {
    isEdit: false,
    selectAll: false,
    discount: {
      id: 0,
      name: '',
      description: '',
      discount: '',
      start_date: '',
      end_date: '',
      start_time: '',
      end_time: '',
      service_types: [],
      user_limit: 0,
      status: 'active'
    },
    serviceTypes: [],
    selectedTypes: [],
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
      this.loadDiscount(options.id);
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

  loadDiscount: function (id) {
    app.request({
      url: `/admin/marketing/discounts/${id}`
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
        
        // 处理日期格式：提取纯日期部分（YYYY-MM-DD）
        const formatDate = (dateStr) => {
          if (!dateStr) return '';
          if (dateStr.includes('T') || dateStr.includes('Z')) {
            return dateStr.split('T')[0] || dateStr.split(' ')[0];
          }
          return dateStr;
        };
        
        this.setData({ 
          discount: {
            ...data,
            start_date: formatDate(data.start_date),
            end_date: formatDate(data.end_date),
            service_types: numericTypes,
            status: data.status === 1 ? 'active' : 'inactive'
          },
          selectedTypes: numericTypes,
          statusIndex: data.status === 1 ? 0 : 1
        });
        setTimeout(() => {
          this.updateServiceTypeSelections();
        }, 300);
      }
    }).catch(() => {
      console.log('加载失败');
    });
  },

  onNameInput: function (e) {
    this.setData({ 'discount.name': e.detail.value });
  },

  onDescInput: function (e) {
    this.setData({ 'discount.description': e.detail.value });
  },

  onDiscountInput: function (e) {
    this.setData({ 'discount.discount': e.detail.value });
  },

  onStartDateChange: function (e) {
    this.setData({ 'discount.start_date': e.detail.value });
  },

  onEndDateChange: function (e) {
    this.setData({ 'discount.end_date': e.detail.value });
  },

  onStartTimeChange: function (e) {
    this.setData({ 'discount.start_time': e.detail.value });
  },

  onEndTimeChange: function (e) {
    this.setData({ 'discount.end_time': e.detail.value });
  },

  toggleSelectAll: function () {
    const selectAll = !this.data.selectAll;
    const selectedTypes = selectAll ? this.data.serviceTypes.map(t => t.id) : [];
    this.setData({ 
      selectAll, 
      selectedTypes: selectedTypes,
      'discount.service_types': selectedTypes
    });
    this.updateServiceTypeSelections();
  },

  toggleServiceType: function (e) {
    const id = parseInt(e.currentTarget.dataset.id);
    const selectedTypes = this.data.selectedTypes.slice();
    const index = selectedTypes.indexOf(id);
    
    if (index > -1) {
      selectedTypes.splice(index, 1);
    } else {
      selectedTypes.push(id);
    }
    
    this.setData({ 
      selectedTypes: selectedTypes,
      'discount.service_types': selectedTypes,
      selectAll: selectedTypes.length === this.data.serviceTypes.length
    });
    
    this.updateServiceTypeSelections();
  },

  onUserLimitInput: function (e) {
    this.setData({ 'discount.user_limit': e.detail.value });
  },

  onStatusChange: function (e) {
    const index = e.detail.value;
    this.setData({ 
      statusIndex: index,
      'discount.status': this.data.statusOptions[index].value
    });
  },

  saveDiscount: function () {
    if (!this.data.discount.name) {
      wx.showToast({ title: '请输入活动名称', icon: 'none' });
      return;
    }
    if (!this.data.discount.discount) {
      wx.showToast({ title: '请输入折扣力度', icon: 'none' });
      return;
    }

    const url = this.data.isEdit 
      ? `/admin/marketing/discounts/${this.data.discount.id}`
      : '/admin/marketing/discounts';
    const method = this.data.isEdit ? 'PUT' : 'POST';

    // 处理日期格式：提取纯日期部分（YYYY-MM-DD）
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      // 如果是 ISO 格式（包含 T 或 Z），提取日期部分
      if (dateStr.includes('T') || dateStr.includes('Z')) {
        return dateStr.split('T')[0] || dateStr.split(' ')[0];
      }
      return dateStr;
    };

    const postData = {
      name: this.data.discount.name,
      description: this.data.discount.description || '',
      discount: this.data.discount.discount,
      start_date: formatDate(this.data.discount.start_date),
      end_date: formatDate(this.data.discount.end_date),
      start_time: this.data.discount.start_time || '',
      end_time: this.data.discount.end_time || '',
      service_types: JSON.stringify(this.data.discount.service_types || []),
      user_limit: parseInt(this.data.discount.user_limit) || 0,
      status: this.data.discount.status || 'active'
    };

    app.request({
      url: url,
      method: method,
      data: postData
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

  deleteDiscount: function () {
    wx.showModal({
      title: '删除活动',
      content: '确定要删除该限时折扣活动吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/marketing/discounts/${this.data.discount.id}`,
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