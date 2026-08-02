const app = getApp();

Page({
  data: {
    orders: [],
    filteredOrders: [],
    isOrderListEmpty: true,
    activeTab: 'all',
    statusMap: {
      0: '待支付',
      1: '待接单',
      2: '待服务',
      3: '服务中',
      4: '已完成',
      5: '已取消',
      6: '已取消',
      7: '已取消'
    },
    statusColors: {
      0: '#FFD700',
      1: '#1E90FF',
      2: '#32CD32',
      3: '#FF8C00',
      4: '#999',
      5: '#DC143C',
      6: '#FF69B4',
      7: '#9370DB'
    }
  },

  onShow: function () {
    app.switchRole('user');
    this.loadOrders();
  },

  loadOrders: function () {
    app.request({
      url: '/orders'
    }).then(res => {
      if (res.code === 0) {
        this.setData({ orders: res.data.rows || [] });
      } else {
        this.setData({ orders: [] });
      }
    }).catch(() => {
      this.setData({ orders: [] });
      wx.showToast({ title: '获取订单列表失败', icon: 'none' });
    }).finally(() => {
      this.filterOrders();
    });
  },

  goToDetail: function (e) {
    const orderId = e.currentTarget.dataset.orderId;
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${orderId}`
    });
  },

  requestRefund: function (e) {
    this.cancelOrder(e);
  },

  cancelOrder: function (e) {
    const orderId = e.currentTarget.dataset.orderId;
    wx.showModal({
      title: '取消订单',
      content: '取消订单将同时提交退款申请，退款金额按平台规则计算，需管理员审核。确定继续吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/orders/${orderId}/cancel`,
            method: 'POST'
          }).then(result => {
            if (result.code === 0) {
              wx.showToast({ title: result.message || '订单已取消', icon: 'success' });
              this.loadOrders();
            } else {
              wx.showToast({ title: result.message || '取消失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '取消失败', icon: 'none' });
          });
        }
      }
    });
  },

  contactProvider: function (e) {
    const phone = e.currentTarget.dataset.phone;
    if (phone) {
      wx.makePhoneCall({
        phoneNumber: phone,
        fail: () => {
          wx.showToast({ title: '拨打电话失败', icon: 'none' });
        }
      });
    } else {
      wx.showToast({ title: '暂无联系电话', icon: 'none' });
    }
  },

  goToReview: function (e) {
    const orderId = e.currentTarget.dataset.orderId;
    wx.navigateTo({
      url: `/pages/review/review?order_id=${orderId}`
    });
  },

  payOrder: function (e) {
    const orderId = e.currentTarget.dataset.orderId;
    wx.showModal({
      title: '虚拟支付',
      content: '确认使用虚拟支付完成订单？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/orders/${orderId}/pay`,
            method: 'POST'
          }).then((result) => {
            if (result.code === 0) {
              wx.showToast({ title: '支付成功', icon: 'success' });
              this.loadOrders();
            } else {
              wx.showToast({ title: result.message || '支付失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '支付失败', icon: 'none' });
          });
        }
      }
    });
  },

  setTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.filterOrders();
  },

  filterOrders: function () {
    const { activeTab, orders } = this.data;
    let filteredOrders = orders;

    if (activeTab === 'pending') {
      filteredOrders = orders.filter(o => [1, 2, 3].includes(o.status));
    } else if (activeTab === 'completed') {
      filteredOrders = orders.filter(o => o.status === 4);
    } else if (activeTab === 'refund') {
      filteredOrders = orders.filter(o => [5, 6, 7].includes(o.status));
    }

    this.setData({
      filteredOrders,
      isOrderListEmpty: filteredOrders.length === 0
    });
  }
});
