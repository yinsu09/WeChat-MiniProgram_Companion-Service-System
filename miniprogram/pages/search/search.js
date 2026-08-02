const app = getApp();

Page({
  data: {
    keyword: '',
    hasSearched: false,
    showFilter: false,
    showTypeFilter: false,
    showPriceFilter: false,
    showLevelFilter: false,
    selectedType: 0,
    selectedTypeName: '',
    selectedPrice: 0,
    selectedPriceRange: '',
    selectedLevel: 0,
    selectedLevelName: '',
    activeTab: 'service',
    serviceTypes: [],
    searchHistory: [],
    hotKeywords: ['陪诊', '陪护', '陪玩', '金牌服务', '医院陪诊', '老人陪护'],
    serviceResults: [],
    providerResults: []
  },

  onLoad: function (options) {
    if (options && options.tab === 'provider') {
      this.setData({ activeTab: 'provider' });
    }
    this.loadSearchHistory();
    this.loadServiceTypes();
  },

  loadSearchHistory: function () {
    const history = wx.getStorageSync('searchHistory') || [];
    this.setData({ searchHistory: history });
  },

  loadServiceTypes: function () {
    app.request({ url: '/services/types' }).then((res) => {
      if (res.code === 0 && res.data && res.data.length > 0) {
        this.setData({ serviceTypes: res.data });
      } else {
        this.setData({ serviceTypes: [] });
      }
    }).catch(() => {
      this.setData({ serviceTypes: [] });
    });
  },

  onInput: function (e) {
    this.setData({ keyword: e.detail.value });
  },

  clearKeyword: function () {
    this.setData({ 
      keyword: '',
      hasSearched: false,
      showFilter: false
    });
  },

  onSearch: function () {
    const keyword = this.data.keyword.trim();
    if (!keyword) {
      wx.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }

    this.saveSearchHistory(keyword);
    this.setData({ 
      hasSearched: true,
      showFilter: true
    });
    this.doSearch();
  },

  saveSearchHistory: function (keyword) {
    let history = this.data.searchHistory;
    const index = history.indexOf(keyword);
    if (index > -1) {
      history.splice(index, 1);
    }
    history.unshift(keyword);
    if (history.length > 10) {
      history = history.slice(0, 10);
    }
    this.setData({ searchHistory: history });
    wx.setStorageSync('searchHistory', history);
  },

  clearHistory: function () {
    this.setData({ searchHistory: [] });
    wx.removeStorageSync('searchHistory');
  },

  searchByHistory: function (e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({ keyword });
    this.onSearch();
  },

  doSearch: function () {
    const { keyword, selectedType, selectedPrice, selectedLevel } = this.data;
    
    app.request({
      url: '/search/services',
      data: {
        keyword,
        type_id: selectedType,
        price_range: selectedPrice,
        level: selectedLevel
      }
    }).then(res => {
      if (res.code === 0) {
        this.setData({ serviceResults: res.data.services || [] });
      } else {
        this.setData({ serviceResults: [] });
      }
    }).catch(() => {
      this.setData({ serviceResults: [] });
    });

    app.request({
      url: '/search/providers',
      data: {
        keyword,
        type_id: selectedType,
        level: selectedLevel
      }
    }).then(res => {
      if (res.code === 0) {
        const providerResults = (res.data.providers || []).map((item) => ({
          ...item,
          avatar_url: app.resolveImageUrl(item.avatar_url)
        }));
        this.setData({ providerResults });
      } else {
        this.setData({ providerResults: [] });
      }
    }).catch(() => {
      this.setData({ providerResults: [] });
    });
  },

  toggleTypeFilter: function () {
    this.setData({
      showTypeFilter: !this.data.showTypeFilter,
      showPriceFilter: false,
      showLevelFilter: false
    });
  },

  togglePriceFilter: function () {
    this.setData({
      showPriceFilter: !this.data.showPriceFilter,
      showTypeFilter: false,
      showLevelFilter: false
    });
  },

  toggleLevelFilter: function () {
    this.setData({
      showLevelFilter: !this.data.showLevelFilter,
      showTypeFilter: false,
      showPriceFilter: false
    });
  },

  selectType: function (e) {
    const type = e.currentTarget.dataset.type;
    const typeName = type === 0 ? '' : this.data.serviceTypes.find(t => t.id === type)?.name || '';
    this.setData({
      selectedType: type,
      selectedTypeName: typeName,
      showTypeFilter: false
    });
    if (this.data.hasSearched) {
      this.doSearch();
    }
  },

  selectPrice: function (e) {
    const price = e.currentTarget.dataset.price;
    const priceRanges = ['', '0-50元', '50-100元', '100-200元', '200元以上'];
    this.setData({
      selectedPrice: price,
      selectedPriceRange: priceRanges[price],
      showPriceFilter: false
    });
    if (this.data.hasSearched) {
      this.doSearch();
    }
  },

  selectLevel: function (e) {
    const level = e.currentTarget.dataset.level;
    const levelNames = ['', '金牌服务', '银牌服务', '铜牌服务'];
    this.setData({
      selectedLevel: level,
      selectedLevelName: levelNames[level],
      showLevelFilter: false
    });
    if (this.data.hasSearched) {
      this.doSearch();
    }
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  goBack: function () {
    wx.navigateBack();
  },

  goToServiceDetail: function (e) {
    const serviceId = e.currentTarget.dataset.serviceId;
    wx.navigateTo({
      url: `/pages/service-detail/service-detail?id=${serviceId}`
    });
  },

  goToProviderDetail: function (e) {
    const providerId = e.currentTarget.dataset.providerId;
    wx.navigateTo({
      url: `/pages/provider-detail/provider-detail?id=${providerId}`
    });
  }
});