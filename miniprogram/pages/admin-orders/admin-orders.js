const app = getApp();

Page({
  data: {
    orders: [],
    searchKeyword: '',
    currentCategory: 'regular',
    currentStatus: '',
    categoryOptions: [
      { label: '常规服务', value: 'regular', desc: '标准预约订单' },
      { label: '指派服务', value: 'custom', desc: '用户指定服务' },
      { label: '组团游', value: 'group', desc: '活动组团订单' }
    ],
    statusOptions: [
      { label: '全部', value: '' },
      { label: '待指派', value: 'pending' },
      { label: '已指派', value: 'assigned' },
      { label: '进行中', value: 'in_progress' },
      { label: '已完成', value: 'completed' },
      { label: '退款中', value: 'refunding' },
      { label: '已退款', value: 'refunded' },
      { label: '已取消', value: 'canceled' }
    ]
  },

  onLoad: function () {
    this.loadOrders();
  },

  onShow: function () {
    this.loadOrders();
  },

  loadOrders: function () {
    const params = { category: this.data.currentCategory };
    if (this.data.currentStatus) {
      params.status = this.data.currentStatus;
    }
    if (this.data.searchKeyword) {
      params.keyword = this.data.searchKeyword;
    }

    app.request({
      url: '/admin/orders',
      data: params
    }).then(res => {
      if (res.code === 0) {
        this.setData({ orders: res.data });
      } else {
        this.setData({ orders: [] });
      }
    }).catch(() => {
      this.setData({ orders: [] });
    });
  },

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
    this.loadOrders();
  },

  filterByStatus: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ currentStatus: status });
    this.loadOrders();
  },

  switchCategory: function (e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ currentCategory: category });
    this.loadOrders();
  },

  goToOrderDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-orders/detail/detail?id=${id}` });
  },

  assignProvider: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-orders/assign/assign?id=${id}` });
  },

  handleRefund: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-refunds/detail/detail?order_id=${id}` });
  },

  exportOrders: function () {
    wx.showToast({ title: '导出功能开发中', icon: 'none' });
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
    return texts[status] || '未知';
  }
});