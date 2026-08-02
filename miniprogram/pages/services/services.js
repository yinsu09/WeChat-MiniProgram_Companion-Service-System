const app = getApp();

Page({
  data: {
    services: [],
    serviceTypes: [],
    selectedTypeName: '',
    totalCount: 0,
    loading: false,
    typeId: null,
    providerId: null,
    filter: {
      type: 'all',
      price: 0,
      level: 0,
      sort: 'default'
    },
    showPriceFilter: false,
    showLevelFilter: false,
    showSortFilter: false,
    sortName: '默认排序'
  },

  onLoad: function (options) {
    if (options.typeId) {
      this.setData({
        typeId: options.typeId,
        'filter.type': options.typeId
      });
    }
    if (options.provider_id) {
      this.setData({ providerId: options.provider_id });
    }
    this.loadServiceTypes();
    this.loadServices();
  },

  loadServiceTypes: function () {
    app.request({ url: '/services/types' }).then((res) => {
      if (res.code !== 0) return;
      const serviceTypes = (res.data || []).map((item) => ({
        id: item.id,
        name: item.name,
        status: Number(item.status),
        enabled: Number(item.status) === 1
      }));
      const { filter } = this.data;
      let selectedTypeName = '';
      if (filter.type !== 'all') {
        const current = serviceTypes.find((t) => String(t.id) === String(filter.type));
        selectedTypeName = current ? current.name : '';
      }
      this.setData({ serviceTypes, selectedTypeName });
    }).catch(() => {});
  },

  onShow: function () {
    app.switchRole('user');
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      });
    }
  },

  loadServices: function () {
    this.setData({ loading: true });

    const { filter } = this.data;
    const params = {};

    if (filter.type !== 'all') {
      params.type_id = filter.type;
    }
    if (this.data.providerId) {
      params.provider_id = this.data.providerId;
    }
    if (filter.price > 0) {
      params.price_range = filter.price;
    }
    if (filter.level > 0) {
      params.level = filter.level;
    }
    if (filter.sort === 'hot') {
      params.sort = 'hot';
    }

    app.request({
      url: '/services',
      data: params
    }).then(res => {
      if (res.code === 0) {
        let services = res.data || [];

        if (filter.sort === 'price_asc') {
          services.sort((a, b) => a.base_price - b.base_price);
        } else if (filter.sort === 'price_desc') {
          services.sort((a, b) => b.base_price - a.base_price);
        }

        this.setData({
          services,
          totalCount: services.length,
          loading: false
        });
      } else {
        this.setData({ loading: false });
      }
    }).catch(() => {
      this.setData({
        services: [],
        totalCount: 0,
        loading: false
      });
      wx.showToast({ title: '获取服务列表失败', icon: 'none' });
    });
  },

  setTypeFilter: function (e) {
    const type = e.currentTarget.dataset.type;
    const disabled = e.currentTarget.dataset.disabled;

    if (type !== 'all' && (disabled === 1 || disabled === '1' || disabled === true)) {
      wx.showToast({ title: '该服务类型已禁用，暂不可选', icon: 'none' });
      return;
    }

    const selectedTypeName = type === 'all'
      ? ''
      : ((this.data.serviceTypes || []).find((t) => String(t.id) === String(type)) || {}).name || '';

    this.setData({
      'filter.type': type,
      selectedTypeName,
      showPriceFilter: false,
      showLevelFilter: false,
      showSortFilter: false
    });
    this.loadServices();
  },

  togglePriceFilter: function () {
    this.setData({
      showPriceFilter: !this.data.showPriceFilter,
      showLevelFilter: false,
      showSortFilter: false
    });
  },

  toggleLevelFilter: function () {
    this.setData({
      showLevelFilter: !this.data.showLevelFilter,
      showPriceFilter: false,
      showSortFilter: false
    });
  },

  toggleSortFilter: function () {
    this.setData({
      showSortFilter: !this.data.showSortFilter,
      showPriceFilter: false,
      showLevelFilter: false
    });
  },

  selectPrice: function (e) {
    const price = parseInt(e.currentTarget.dataset.price);
    this.setData({
      'filter.price': price,
      showPriceFilter: false
    });
    this.loadServices();
  },

  selectLevel: function (e) {
    const level = parseInt(e.currentTarget.dataset.level);
    this.setData({
      'filter.level': level,
      showLevelFilter: false
    });
    this.loadServices();
  },

  selectSort: function (e) {
    const sort = e.currentTarget.dataset.sort;
    const sortNames = {
      'default': '默认排序',
      'price_asc': '价格从低到高',
      'price_desc': '价格从高到低',
      'hot': '热门优先'
    };
    this.setData({
      'filter.sort': sort,
      sortName: sortNames[sort],
      showSortFilter: false
    });
    this.loadServices();
  },

  clearTypeFilter: function () {
    this.setData({
      'filter.type': 'all',
      selectedTypeName: '',
      typeId: null
    });
    this.loadServices();
  },

  clearPriceFilter: function () {
    this.setData({ 'filter.price': 0 });
    this.loadServices();
  },

  clearLevelFilter: function () {
    this.setData({ 'filter.level': 0 });
    this.loadServices();
  },

  clearAllFilters: function () {
    this.setData({
      filter: {
        type: 'all',
        price: 0,
        level: 0,
        sort: 'default'
      },
      sortName: '默认排序',
      selectedTypeName: '',
      typeId: null
    });
    this.loadServices();
  },

  getTypeName: function (type) {
    if (type === 'all') return '全部类型';
    const item = (this.data.serviceTypes || []).find((t) => String(t.id) === String(type));
    return item ? item.name : '';
  },

  getPriceName: function (price) {
    const names = { 1: '0-50元', 2: '50-100元', 3: '100-200元', 4: '200元以上' };
    return names[price] || '';
  },

  getLevelName: function (level) {
    const names = { 1: '金牌服务', 2: '银牌服务', 3: '铜牌服务' };
    return names[level] || '';
  },

  goToDetail: function (e) {
    const serviceId = e.currentTarget.dataset.serviceId;
    wx.navigateTo({
      url: `/pages/service-detail/service-detail?id=${serviceId}`
    });
  },

  goChooseProvider: function () {
    const typeId = this.data.filter.type !== 'all' ? this.data.filter.type : '';
    wx.navigateTo({
      url: '/pages/choose-provider/choose-provider' + (typeId ? ('?typeId=' + typeId) : '')
    });
  },

  onPullDownRefresh: function () {
    this.loadServiceTypes();
    this.loadServices();
    wx.stopPullDownRefresh();
  }
});
