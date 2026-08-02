const app = getApp();

Page({
  data: {
    totalIncome: 0,
    currentTab: 'month',
    currentStats: { orders: 0, income: 0, avgRating: '0.0' },
    chartData: [],
    records: []
  },

  onLoad: function () {
    this.loadIncomeData();
  },

  onShow: function () {
    this.loadIncomeData();
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    this.loadIncomeData();
  },

  loadIncomeData: function () {
    app.request({
      url: '/provider/income',
      data: { period: this.data.currentTab }
    }).then(res => {
      if (res.code === 0 && res.data) {
        this.setData({ ...res.data });
      }
    }).catch(() => {
      wx.showToast({ title: '获取收入数据失败', icon: 'none' });
    });
  }
});
