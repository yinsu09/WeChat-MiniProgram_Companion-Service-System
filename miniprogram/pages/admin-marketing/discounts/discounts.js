const app = getApp();

Page({
  data: {
    discounts: [],
    currentStatus: '',
    statusOptions: [
      { label: '全部', value: '' },
      { label: '进行中', value: 'active' },
      { label: '未开始', value: 'inactive' },
      { label: '已结束', value: 'expired' }
    ]
  },

  onLoad: function () {
    this.loadDiscounts();
  },

  onShow: function () {
    this.loadDiscounts();
  },

  loadDiscounts: function () {
    const params = {};
    if (this.data.currentStatus) {
      params.status = this.data.currentStatus;
    }

    app.request({
      url: '/admin/marketing/discounts',
      data: params
    }).then(res => {
      if (res.code === 0) {
        this.setData({ discounts: res.data });
      } else {
        this.setData({ discounts: [] });
      }
    }).catch(() => {
      this.setData({ discounts: [] });
    });
  },

  filterByStatus: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ currentStatus: status });
    this.loadDiscounts();
  },

  goToAdd: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/discounts/detail/detail' });
  },

  goToDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-marketing/discounts/detail/detail?id=${id}` });
  },

  getStatusText: function (status) {
    const texts = {
      active: '进行中',
      inactive: '未开始',
      expired: '已结束'
    };
    return texts[status] || '未知';
  }
});