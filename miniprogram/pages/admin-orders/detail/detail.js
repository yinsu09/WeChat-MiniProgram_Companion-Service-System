const app = getApp();

Page({
  data: {
    order: {
      id: 0,
      order_no: '',
      status: 'pending',
      create_time: '',
      service_time: '',
      address: '',
      service_name: '',
      service_image: '',
      service_type: '',
      duration: 0,
      user_name: '',
      user_phone: '',
      user_avatar: '',
      provider_id: 0,
      provider_name: '',
      provider_phone: '',
      provider_avatar: '',
      provider_level: '',
      service_price: 0,
      duration_price: 0,
      discount_amount: 0,
      total_amount: 0,
      refund_amount: 0,
      refund_reason: '',
      refund_time: '',
      remark: ''
    }
  },

  onLoad: function (options) {
    if (options && options.id) {
      this.loadOrder(options.id);
    }
  },

  loadOrder: function (id) {
    app.request({
      url: `/admin/orders/${id}`
    }).then(res => {
      if (res.code === 0) {
        this.setData({ order: res.data });
      }
    }).catch(() => {
      console.log('加载订单详情失败');
    });
  },

  assignProvider: function () {
    wx.navigateTo({ url: `/pages/admin-orders/assign/assign?id=${this.data.order.id}` });
  },

  cancelOrder: function () {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消该订单吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/orders/${this.data.order.id}/cancel`,
            method: 'PUT'
          }).then(res => {
            if (res.code === 0) {
              wx.showToast({ title: '取消成功', icon: 'success' });
              this.loadOrder(this.data.order.id);
            } else {
              wx.showToast({ title: res.message, icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '取消失败', icon: 'none' });
          });
        }
      }
    });
  },

  handleAction: function () {
    const order = this.data.order;
    if (order.needs_assign) {
      this.assignProvider();
    } else if (order.display_status === 'refunding') {
      wx.navigateTo({ url: `/pages/admin-refunds/detail/detail?order_id=${order.id}` });
    }
  },

  getStatusText: function (status) {
    const texts = {
      pending: '待指派',
      assigned: '已指派',
      in_progress: '进行中',
      completed: '已完成',
      refunding: '退款中',
      refunded: '已退款',
      canceled: '已取消'
    };
    return texts[status] || status;
  },

  getStatusIcon: function (status) {
    const icons = {
      pending: '⏳',
      assigned: '👤',
      in_progress: '🔄',
      completed: '✅',
      refunding: '💰',
      refunded: '↩️',
      canceled: '❌'
    };
    return icons[status] || '❓';
  },

  getStatusDesc: function (status) {
    const descs = {
      pending: '等待指派服务人员',
      assigned: '已指派服务人员',
      in_progress: '服务进行中',
      completed: '服务已完成',
      refunding: '退款申请处理中',
      refunded: '退款已完成',
      canceled: '订单已取消'
    };
    return descs[status] || '';
  },

  getActionText: function (status) {
    const texts = {
      pending: '指派人员',
      refunding: '处理退款'
    };
    return texts[status] || '';
  }
});