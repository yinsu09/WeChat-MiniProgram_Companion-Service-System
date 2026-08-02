const app = getApp();

Page({
  data: {
    userPoints: 0,
    currentCategory: 'all',
    allItems: [],
    filteredItems: []
  },

  onLoad: function () {
    this.loadMallData();
  },

  onShow: function () {
    app.switchRole('user');
    this.loadMallData();
  },

  switchCategory: function (e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ currentCategory: category });
    this.filterItems();
  },

  filterItems: function () {
    const { allItems, currentCategory } = this.data;
    let filtered = allItems;
    if (currentCategory !== 'all') {
      filtered = allItems.filter(item => item.category === currentCategory);
    }
    this.setData({ filteredItems: filtered });
  },

  loadMallData: function () {
    if (!app.getUserSession().token) {
      this.setData({ userPoints: 0, allItems: [], filteredItems: [] });
      return;
    }

    app.request({ url: '/user/points-mall' }).then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({
          userPoints: res.data.userPoints,
          allItems: res.data.items,
          filteredItems: res.data.items
        });
      } else {
        this.setData({ userPoints: 0, allItems: [], filteredItems: [] });
      }
    }).catch(() => {
      this.setData({ userPoints: 0, allItems: [], filteredItems: [] });
    });
  },

  goToPoints: function () {
    wx.navigateTo({
      url: '/pages/points/points'
    });
  },

  exchangeItem: function (e) {
    const itemId = e.currentTarget.dataset.id;
    const item = this.data.allItems.find(i => i.id === itemId);

    if (!item) return;

    if (!item.canExchange) {
      wx.showToast({ title: '积分不足', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认兑换',
      content: `确定使用${item.points}积分兑换${item.name}吗？`,
      success: (res) => {
        if (res.confirm) {
          this.doExchange(item);
        }
      }
    });
  },

  doExchange: function (item) {
    app.request({
      url: '/user/exchange-coupon',
      method: 'POST',
      data: { coupon_id: item.id }
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '兑换成功', icon: 'success' });
        this.loadMallData();
      } else {
        wx.showToast({ title: res.message || '兑换失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '兑换失败', icon: 'none' });
    });
  }
});