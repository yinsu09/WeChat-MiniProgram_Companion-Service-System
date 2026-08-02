const app = getApp();

Page({
  data: {
    rules: {
      service_fee_rate: 5,
      cancel_24h_rate: 10,
      cancel_2h_rate: 30,
      cancel_started_rate: 50,
      card_refund_rate: 10,
      min_refund_amount: 10,
      free_cancel_provider: true,
      free_cancel_platform: true,
      free_cancel_emergency: true
    },
    examples: {
      penalty24h: 0,
      serviceFee24h: 0,
      refund24h: 0
    }
  },

  onLoad: function () {
    this.loadRules();
  },

  loadRules: function () {
    app.request({
      url: '/admin/refunds/rules'
    }).then(res => {
      if (res.code === 0) {
        this.setData({ rules: res.data });
        this.calculateExamples();
      }
    }).catch(() => {
      console.log('使用默认规则');
    });
  },

  calculateExamples: function () {
    const rules = this.data.rules;
    const amount = 100;

    const penalty24h = amount * rules.cancel_24h_rate / 100;
    const serviceFee24h = amount * rules.service_fee_rate / 100;
    const refund24h = Math.max(0, amount - penalty24h - serviceFee24h);

    this.setData({
      examples: {
        penalty24h: penalty24h.toFixed(2),
        serviceFee24h: serviceFee24h.toFixed(2),
        refund24h: refund24h.toFixed(2)
      }
    });
  },

  onServiceFeeChange: function (e) {
    this.setData({ 'rules.service_fee_rate': parseFloat(e.detail.value) || 0 });
    this.calculateExamples();
  },

  onCancel24hChange: function (e) {
    this.setData({ 'rules.cancel_24h_rate': parseFloat(e.detail.value) || 0 });
    this.calculateExamples();
  },

  onCancel2hChange: function (e) {
    this.setData({ 'rules.cancel_2h_rate': parseFloat(e.detail.value) || 0 });
    this.calculateExamples();
  },

  onCancelStartedChange: function (e) {
    this.setData({ 'rules.cancel_started_rate': parseFloat(e.detail.value) || 0 });
    this.calculateExamples();
  },

  onCardRefundChange: function (e) {
    this.setData({ 'rules.card_refund_rate': parseFloat(e.detail.value) || 0 });
    this.calculateExamples();
  },

  onMinRefundChange: function (e) {
    this.setData({ 'rules.min_refund_amount': parseFloat(e.detail.value) || 0 });
    this.calculateExamples();
  },

  toggleProviderCancel: function () {
    this.setData({ 'rules.free_cancel_provider': !this.data.rules.free_cancel_provider });
  },

  togglePlatformCancel: function () {
    this.setData({ 'rules.free_cancel_platform': !this.data.rules.free_cancel_platform });
  },

  toggleEmergencyCancel: function () {
    this.setData({ 'rules.free_cancel_emergency': !this.data.rules.free_cancel_emergency });
  },

  saveRules: function () {
    app.request({
      url: '/admin/refunds/rules',
      method: 'PUT',
      data: this.data.rules
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  }
});