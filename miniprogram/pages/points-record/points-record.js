const app = getApp();

Page({
  data: {
    records: [],
    loading: true
  },

  onLoad: function () {
    this.loadRecords();
  },

  onShow: function () {
    this.loadRecords();
  },

  loadRecords: function () {
    this.setData({ loading: true });
    app.request({ url: '/user/points-records', data: { limit: 100 } }).then((res) => {
      if (res.code === 0) {
        this.setData({ records: res.data || [], loading: false });
      } else {
        this.setData({ records: [], loading: false });
      }
    }).catch(() => {
      this.setData({ records: [], loading: false });
    });
  }
});
