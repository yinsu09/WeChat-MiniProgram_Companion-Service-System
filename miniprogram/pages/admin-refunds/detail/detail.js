const app = getApp();

Page({
  data: {
    refund: {
      id: 0,
      refund_no: '',
      order_no: '',
      service_name: '',
      user_name: '',
      apply_time: '',
      reason: '',
      order_amount: 0,
      refund_amount: 0,
      penalty_amount: 0,
      service_fee: 0,
      actual_amount: 0,
      status: 'pending',
      process_time: '',
      process_remark: '',
      reject_reason: ''
    },
    processRemark: '',
    statusText: '',
    statusIcon: ''
  },

  onLoad: function (options) {
    if (options && options.id) {
      this.loadRefund(options.id);
    } else if (options && options.order_id) {
      this.loadRefundByOrder(options.order_id);
    }
  },

  loadRefund: function (id) {
    app.request({
      url: `/admin/refunds/${id}`
    }).then(res => {
      if (res.code === 0 && res.data) {
        const status = res.data.status;
        const refund = {
          ...this.data.refund,
          ...res.data,
          order_amount: Number(res.data.order_amount ?? res.data.total_price ?? 0),
          refund_amount: Number(res.data.refund_amount ?? res.data.amount ?? 0),
          penalty_amount: Number(res.data.penalty_amount ?? 0),
          service_fee: Number(res.data.service_fee ?? 0),
          actual_amount: Number(res.data.actual_amount ?? res.data.refund_amount ?? res.data.amount ?? 0),
          statusText: this.getStatusText(status),
          statusIcon: this.getStatusIcon(status)
        };
        this.setData({ refund });
      }
    }).catch(() => {
      console.log('加载退款详情失败');
    });
  },

  loadRefundByOrder: function (orderId) {
    app.request({
      url: `/admin/refunds/by-order/${orderId}`
    }).then(res => {
      if (res.code === 0 && res.data) {
        const status = res.data.status;
        const refund = {
          ...this.data.refund,
          ...res.data,
          order_amount: Number(res.data.order_amount ?? res.data.total_price ?? 0),
          refund_amount: Number(res.data.refund_amount ?? res.data.amount ?? 0),
          penalty_amount: Number(res.data.penalty_amount ?? 0),
          service_fee: Number(res.data.service_fee ?? 0),
          actual_amount: Number(res.data.actual_amount ?? res.data.refund_amount ?? res.data.amount ?? 0),
          statusText: this.getStatusText(status),
          statusIcon: this.getStatusIcon(status)
        };
        this.setData({ refund });
      }
    }).catch(() => {
      console.log('加载退款详情失败');
    });
  },

  onRemarkInput: function (e) {
    this.setData({ processRemark: e.detail.value });
  },

  calculateRefundAmount: function () {
    const refund = this.data.refund;
    const amount = Number(refund.refund_amount) || Number(refund.amount) || 0;
    return amount.toFixed(2);
  },

  handleApprove: function () {
    const actualAmount = this.calculateRefundAmount();
    
    wx.showModal({
      title: '确认退款',
      content: `确定同意退款 ¥${actualAmount} 吗？`,
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/admin/refunds/${this.data.refund.id}/approve`,
            method: 'PUT',
            data: {
              actual_amount: actualAmount,
              process_remark: this.data.processRemark
            }
          }).then(res => {
            if (res.code === 0) {
              wx.showToast({ title: '退款成功', icon: 'success' });
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              wx.showToast({ title: res.message, icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '退款失败', icon: 'none' });
          });
        }
      }
    });
  },

  handleReject: function () {
    wx.showModal({
      title: '拒绝退款',
      content: '请输入拒绝原因',
      editable: true,
      placeholderText: '请输入拒绝原因',
      success: (res) => {
        if (res.confirm) {
          if (!res.content) {
            wx.showToast({ title: '请输入拒绝原因', icon: 'none' });
            return;
          }
          
          app.request({
            url: `/admin/refunds/${this.data.refund.id}/reject`,
            method: 'PUT',
            data: {
              reject_reason: res.content,
              process_remark: this.data.processRemark
            }
          }).then(res => {
            if (res.code === 0) {
              wx.showToast({ title: '已拒绝', icon: 'success' });
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
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

  getStatusText: function (status) {
    const texts = {
      pending: '待处理',
      approved: '已同意',
      rejected: '已拒绝',
      canceled: '已取消',
      6: '待处理',
      7: '已同意',
      5: '已取消'
    };
    return texts[status] || '未知';
  },

  getStatusIcon: function (status) {
    const icons = {
      pending: '⏳',
      approved: '✅',
      rejected: '❌',
      canceled: '↩️',
      6: '⏳',
      7: '✅',
      5: '↩️'
    };
    return icons[status] || '❓';
  }
});