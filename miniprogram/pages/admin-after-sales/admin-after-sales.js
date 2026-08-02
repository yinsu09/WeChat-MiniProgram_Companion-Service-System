const app = getApp();

Page({
  data: {
    list: [],
    currentStatus: 'all',
    statusOptions: [
      { label: '全部', value: 'all' },
      { label: '待处理', value: '0' },
      { label: '已同意', value: '1' },
      { label: '已拒绝', value: '2' }
    ]
  },

  onLoad: function () {
    app.switchRole('admin');
    this.loadList();
  },

  onShow: function () {
    app.switchRole('admin');
    this.loadList();
  },

  setStatus: function (e) {
    this.setData({ currentStatus: e.currentTarget.dataset.status });
    this.loadList();
  },

  loadList: function () {
    const status = this.data.currentStatus === 'all' ? '' : this.data.currentStatus;
    app.request({
      url: '/admin/after-sales',
      data: { status, limit: 50 }
    }).then((res) => {
      if (res.code === 0 && res.data) {
        const list = (res.data.rows || []).map((item) => ({
          ...item,
          statusText: this.getStatusText(item.status),
          typeText: this.getTypeText(item.type)
        }));
        this.setData({ list });
      }
    });
  },

  getStatusText: function (status) {
    const map = { 0: '待处理', 1: '已同意', 2: '已拒绝' };
    return map[status] || '未知';
  },

  getTypeText: function (type) {
    const map = { refund: '退款', end_early: '提前结束', dispute: '纠纷' };
    return map[type] || type;
  },

  goDetail: function (e) {
    wx.navigateTo({
      url: `/pages/admin-after-sales/detail/detail?id=${e.currentTarget.dataset.id}`
    });
  }
});
