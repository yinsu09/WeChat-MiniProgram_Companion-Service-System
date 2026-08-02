const app = getApp();

Page({
  data: {
    coupons: [],
    searchKeyword: '',
    currentStatus: '',
    statusOptions: [
      { label: '全部', value: '' },
      { label: '进行中', value: 'active' },
      { label: '未开始', value: 'inactive' },
      { label: '已过期', value: 'expired' }
    ]
  },

  onLoad: function () {
    this.loadCoupons();
  },

  onShow: function () {
    this.loadCoupons();
  },

  loadCoupons: function () {
    const params = {};
    if (this.data.currentStatus) {
      params.status = this.data.currentStatus;
    }
    if (this.data.searchKeyword) {
      params.keyword = this.data.searchKeyword;
    }

    app.request({
      url: '/admin/marketing/coupons',
      data: params
    }).then(res => {
      if (res.code === 0) {
        this.setData({ coupons: res.data });
      } else {
        this.setData({ coupons: [] });
      }
    }).catch(() => {
      this.setData({ coupons: [] });
    });
  },

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
    this.loadCoupons();
  },

  filterByStatus: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ currentStatus: status });
    this.loadCoupons();
  },

  goToAdd: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/coupons/detail/detail' });
  },

  goToDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-marketing/coupons/detail/detail?id=${id}` });
  },

  getStatusText: function (status) {
    const texts = {
      active: '进行中',
      inactive: '未开始',
      expired: '已过期'
    };
    return texts[status] || '未知';
  }
});