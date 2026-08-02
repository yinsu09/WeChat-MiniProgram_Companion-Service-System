const app = getApp();

Page({
  data: {
    refunds: [],
    stats: {},
    currentStatus: '',
    statusOptions: [
      { label: '全部', value: '' },
      { label: '待处理', value: '6' },
      { label: '退款成功', value: '7' },
      { label: '退款失败', value: 'rejected' },
      { label: '已取消(无退款)', value: '5' }
    ]
  },

  onLoad: function () {
    this.loadRefunds();
    this.loadStats();
  },

  onShow: function () {
    this.loadRefunds();
    this.loadStats();
  },

  loadRefunds: function () {
    const params = {};
    const status = this.data.currentStatus;
    if (status === 'rejected') {
      params.refund_result = 'rejected';
    } else if (status) {
      params.status = status;
    }

    app.request({
      url: '/admin/refunds',
      data: params
    }).then(res => {
      if (res.code === 0) {
        const refunds = (res.data || []).map((item) => ({
          ...item,
          statusText: this.getStatusText(item.status, item.refund_result),
          statusClass: this.getStatusClass(item.status, item.refund_result)
        }));
        this.setData({ refunds });
      } else {
        this.setData({ refunds: [] });
      }
    }).catch(() => {
      this.setData({ refunds: [] });
    });
  },

  loadStats: function () {
    app.request({
      url: '/admin/refunds/stats'
    }).then(res => {
      if (res.code === 0) {
        this.setData({ stats: res.data });
      }
    }).catch(() => {
      console.log('加载统计数据失败');
    });
  },

  filterByStatus: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ currentStatus: status });
    this.loadRefunds();
  },

  goToRefundDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-refunds/detail/detail?id=${id}` });
  },

  goToRefundRules: function () {
    wx.navigateTo({ url: '/pages/admin-refunds/rules/rules' });
  },

  handleApprove: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '同意退款',
      content: '确定要同意该退款申请吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/refunds/${id}/approve`,
            method: 'PUT'
          }).then(res => {
            if (res.code === 0) {
              wx.showToast({ title: '已同意退款', icon: 'success' });
              this.loadRefunds();
              this.loadStats();
            } else {
              wx.showToast({ title: res.message, icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
  },

  handleReject: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '拒绝退款',
      content: '拒绝后订单仍保持取消状态，仅退款失败。请输入拒绝原因（可选）',
      editable: true,
      placeholderText: '请输入拒绝原因',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/refunds/${id}/reject`,
            method: 'PUT',
            data: { reject_reason: res.content || '管理员拒绝退款' }
          }).then(res => {
            if (res.code === 0) {
              wx.showToast({ title: '已拒绝', icon: 'success' });
              this.loadRefunds();
              this.loadStats();
            } else {
              wx.showToast({ title: res.message, icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
  },

  getStatusText: function (status, refundResult) {
    if (String(status) === '6') return '待处理';
    if (String(status) === '7') return '退款成功';
    if (String(status) === '5' && refundResult === 'rejected') return '退款失败';
    if (String(status) === '5') return '已取消';
    return '未知';
  },

  getStatusClass: function (status, refundResult) {
    if (String(status) === '6') return 'pending';
    if (String(status) === '7') return 'approved';
    if (String(status) === '5' && refundResult === 'rejected') return 'rejected';
    if (String(status) === '5') return 'canceled';
    return '';
  }
});