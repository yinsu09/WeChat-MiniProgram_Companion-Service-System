const app = getApp();

Page({
  data: {
    orders: [],
    filteredOrders: [],
    filterStatus: 'all',
    statusMap: {
      1: '待接单',
      2: '待服务',
      3: '服务中',
      4: '已完成',
      5: '已取消',
      6: '退费中',
      7: '已退费'
    },
    statusColors: {
      1: '#FF9800',
      2: '#4CAF50',
      3: '#2196F3',
      4: '#999',
      5: '#E91E63',
      6: '#9C27B0',
      7: '#795548'
    },
    showRejectModal: false,
    showCancelModal: false,
    currentOrder: null,
    rejectReason: '',
    cancelReason: ''
  },

  onLoad: function (options) {
    if (options.status) {
      this.setData({ filterStatus: options.status });
    }
  },

  onShow: function () {
    this.loadOrders();
  },

  setFilter: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ filterStatus: status });
    this.filterOrders();
  },

  filterOrders: function () {
    const { orders, filterStatus } = this.data;
    if (filterStatus === 'all') {
      this.setData({ filteredOrders: orders });
    } else {
      const filtered = orders.filter(order => order.status === parseInt(filterStatus));
      this.setData({ filteredOrders: filtered });
    }
  },

  loadOrders: function () {
    app.request({
      url: '/provider/orders'
    }).then(res => {
      if (res.code === 0) {
        this.setData({ orders: res.data || [] });
        this.filterOrders();
      } else {
        this.setData({ orders: [] });
        this.filterOrders();
      }
    }).catch(() => {
      this.setData({ orders: [] });
      this.filterOrders();
      wx.showToast({ title: '获取订单失败', icon: 'none' });
    });
  },

  getProviderId: function () {
    let providerInfo = app.globalData.providerInfo;
    if (!providerInfo) {
      providerInfo = wx.getStorageSync('userInfo');
    }
    return providerInfo ? providerInfo.id : null;
  },

  callUser: function (e) {
    const phone = e.currentTarget.dataset.phone;
    if (phone) {
      wx.makePhoneCall({
        phoneNumber: phone,
        fail: () => {
          wx.showToast({ title: '拨打电话失败', icon: 'none' });
        }
      });
    }
  },

  acceptOrder: function (e) {
    const order = e.currentTarget.dataset.order;
    wx.showModal({
      title: '接单确认',
      content: `确定接受「${order.service_name}」订单吗？`,
      success: (res) => {
        if (res.confirm) {
          this.updateOrderStatus(order.id, 2, '接单成功');
        }
      }
    });
  },

  showRejectModal: function (e) {
    const order = e.currentTarget.dataset.order;
    this.setData({
      showRejectModal: true,
      currentOrder: order,
      rejectReason: ''
    });
  },

  hideRejectModal: function () {
    this.setData({
      showRejectModal: false,
      currentOrder: null,
      rejectReason: ''
    });
  },

  onRejectReasonChange: function (e) {
    this.setData({ rejectReason: e.detail.value });
  },

  confirmReject: function () {
    const { currentOrder, rejectReason } = this.data;
    if (!rejectReason.trim()) {
      wx.showToast({ title: '请输入拒单原因', icon: 'none' });
      return;
    }
    this.updateOrderStatus(currentOrder.id, 5, '已拒单', rejectReason);
    this.hideRejectModal();
  },

  startService: function (e) {
    const orderId = e.currentTarget.dataset.orderId;
    wx.showModal({
      title: '开始服务',
      content: '确定要开始服务吗？',
      success: (res) => {
        if (res.confirm) {
          this.updateOrderStatus(orderId, 3, '服务已开始');
        }
      }
    });
  },

  completeService: function (e) {
    const orderId = e.currentTarget.dataset.orderId;
    const order = this.data.orders.find((o) => o.id === parseInt(orderId, 10));
    const isMultiCard = order && order.is_multi_card;
    wx.showModal({
      title: '确认完成',
      content: isMultiCard
        ? `确认本次服务已完成？需用户同时确认。${order && order.card_remaining > 1 ? '完成后用户可预约下次。' : ''}`
        : '确认服务已完成？需用户同时确认后订单才会结束。',
      success: (res) => {
        if (res.confirm) {
          this.updateOrderStatus(orderId, 4);
        }
      }
    });
  },

  showCancelModal: function (e) {
    const order = e.currentTarget.dataset.order;
    this.setData({
      showCancelModal: true,
      currentOrder: order,
      cancelReason: ''
    });
  },

  hideCancelModal: function () {
    this.setData({
      showCancelModal: false,
      currentOrder: null,
      cancelReason: ''
    });
  },

  onCancelReasonChange: function (e) {
    this.setData({ cancelReason: e.detail.value });
  },

  confirmCancel: function () {
    const { currentOrder, cancelReason } = this.data;
    this.updateOrderStatus(currentOrder.id, 5, '已取消', cancelReason);
    this.hideCancelModal();
  },

  updateOrderStatus: function (orderId, status, successMsg, reason = '') {
    const orderIdNum = parseInt(orderId, 10);
    wx.showLoading({ title: '处理中...' });

    app.request({
      url: '/provider/order/status',
      method: 'PUT',
      data: { order_id: orderIdNum, status: status, reason: reason }
    }).then(res => {
      wx.hideLoading();
      if (res.code === 0) {
        wx.showToast({ title: res.message || successMsg || '操作成功', icon: 'success' });
        this.loadOrders();
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
        this.loadOrders();
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
      this.loadOrders();
    });
  },

  goToReview: function (e) {
    const order = e.currentTarget.dataset.order;
    wx.navigateTo({
      url: `/pages/provider-review/provider-review?order_id=${order.id}`
    });
  }
});