const app = getApp();

Page({
  data: {
    item: null,
    adminReply: '',
    refundAmount: '',
    statusText: '',
    typeText: ''
  },

  onLoad: function (options) {
    app.switchRole('admin');
    if (options.id) {
      this.loadDetail(options.id);
    }
  },

  loadDetail: function (id) {
    app.request({ url: `/admin/after-sales/${id}` }).then((res) => {
      if (res.code === 0 && res.data) {
        const item = res.data;
        this.setData({
          item,
          refundAmount: String(item.refund_amount || item.total_price || ''),
          statusText: this.getStatusText(item.status),
          typeText: this.getTypeText(item.type)
        });
      }
    });
  },

  getStatusText: function (status) {
    return { 0: '待处理', 1: '已同意', 2: '已拒绝' }[status] || '未知';
  },

  getTypeText: function (type) {
    return { refund: '退款申请', end_early: '提前结束', dispute: '服务纠纷' }[type] || type;
  },

  onReplyInput: function (e) {
    this.setData({ adminReply: e.detail.value });
  },

  onAmountInput: function (e) {
    this.setData({ refundAmount: e.detail.value });
  },

  approve: function () {
    const { item, adminReply, refundAmount } = this.data;
    wx.showModal({
      title: '同意售后',
      content: '确定同意该售后申请并进入退款流程吗？',
      success: (res) => {
        if (!res.confirm) return;
        app.request({
          url: `/admin/after-sales/${item.id}/approve`,
          method: 'PUT',
          data: { admin_reply: adminReply, refund_amount: parseFloat(refundAmount) }
        }).then((result) => {
          wx.showToast({ title: result.message || '已处理', icon: result.code === 0 ? 'success' : 'none' });
          if (result.code === 0) this.loadDetail(item.id);
        });
      }
    });
  },

  reject: function () {
    const { item, adminReply } = this.data;
    app.request({
      url: `/admin/after-sales/${item.id}/reject`,
      method: 'PUT',
      data: { admin_reply: adminReply || '不符合退款条件' }
    }).then((result) => {
      wx.showToast({ title: result.message || '已拒绝', icon: result.code === 0 ? 'success' : 'none' });
      if (result.code === 0) this.loadDetail(item.id);
    });
  },

  previewImage: function (e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ current: url, urls: this.data.item.images || [url] });
  }
});
