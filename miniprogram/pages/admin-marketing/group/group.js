const app = getApp();

Page({
  data: {
    groups: [],
    currentStatus: '',
    statusOptions: [
      { label: '全部', value: '' },
      { label: '招募中', value: 'active' },
      { label: '已满', value: 'full' },
      { label: '已结束', value: 'completed' }
    ]
  },

  onLoad: function () {
    this.loadGroups();
  },

  onShow: function () {
    this.loadGroups();
  },

  loadGroups: function () {
    const params = {};
    if (this.data.currentStatus) {
      params.status = this.data.currentStatus;
    }

    app.request({
      url: '/admin/marketing/group',
      data: params
    }).then(res => {
      if (res.code === 0) {
        this.setData({ groups: res.data });
      } else {
        this.setData({ groups: [] });
      }
    }).catch(() => {
      this.setData({ groups: [] });
    });
  },

  filterByStatus: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ currentStatus: status });
    this.loadGroups();
  },

  goToAdd: function () {
    wx.navigateTo({ url: '/pages/admin-marketing/group/detail/detail' });
  },

  goToDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-marketing/group/detail/detail?id=${id}` });
  },

  getStatusText: function (status) {
    const texts = {
      active: '招募中',
      inactive: '未开始',
      full: '已满',
      completed: '已结束'
    };
    return texts[status] || '未知';
  }
});