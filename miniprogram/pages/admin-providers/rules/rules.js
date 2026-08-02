const app = getApp();

Page({
  data: {
    rules: {
      service_count: {
        bronze: 0,
        silver: 50,
        gold: 100
      },
      rating: {
        bronze: 3.0,
        silver: 4.0,
        gold: 4.5
      },
      demote: {
        bad_review_count: 5,
        min_rating: 3.5
      }
    }
  },

  onLoad: function () {
    this.loadRules();
  },

  loadRules: function () {
    app.request({
      url: '/admin/provider-level-rules'
    }).then(res => {
      if (res.code === 0) {
        this.setData({ rules: res.data });
      }
    }).catch(() => {
      console.log('使用默认规则');
    });
  },

  onServiceCountInput: function (e) {
    const level = e.currentTarget.dataset.level;
    const value = parseInt(e.detail.value) || 0;
    this.setData({ [`rules.service_count.${level}`]: value });
  },

  onRatingInput: function (e) {
    const level = e.currentTarget.dataset.level;
    const value = parseFloat(e.detail.value) || 0;
    this.setData({ [`rules.rating.${level}`]: value });
  },

  onDemoteInput: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = field === 'min_rating' ? parseFloat(e.detail.value) || 0 : parseInt(e.detail.value) || 0;
    this.setData({ [`rules.demote.${field}`]: value });
  },

  handleSave: function () {
    app.request({
      url: '/admin/provider-level-rules',
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