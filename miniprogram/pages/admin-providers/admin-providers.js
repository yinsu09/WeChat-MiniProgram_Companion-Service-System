const app = getApp();

Page({
  data: {
    providers: [],
    searchKeyword: '',
    showFilterPanel: false,
    currentStatus: '',
    currentLevel: '',
    currentServiceType: '',
    currentRating: '',
    currentCount: '',
    sortBy: '',
    sortOrder: 'desc',
    statusOptions: [
      { label: '全部', value: '' },
      { label: '空闲', value: 'idle' },
      { label: '忙碌', value: 'busy' },
      { label: '离线', value: 'offline' },
      { label: '已禁用', value: 'disabled' }
    ],
    levelOptions: [
      { label: '全部等级', value: '' },
      { label: '金牌', value: '3' },
      { label: '银牌', value: '2' },
      { label: '铜牌', value: '1' },
      { label: '新手', value: '0' }
    ],
    serviceTypeOptions: [],
    ratingOptions: [
      { label: '全部', value: '' },
      { label: '4.5分以上', value: '4.5' },
      { label: '4.0分以上', value: '4.0' },
      { label: '3.5分以上', value: '3.5' },
      { label: '3.0分以上', value: '3.0' }
    ],
    countOptions: [
      { label: '全部', value: '' },
      { label: '100次以上', value: '100' },
      { label: '50-99次', value: '50-99' },
      { label: '10-49次', value: '10-49' },
      { label: '10次以下', value: '0-9' }
    ]
  },

  onLoad: function () {
    this.loadServiceTypes();
    this.loadProviders();
  },

  onShow: function () {
    this.loadServiceTypes();
    this.loadProviders();
  },

  loadServiceTypes: function () {
    app.request({
      url: '/admin/service-types/all'
    }).then(res => {
      if (res.code === 0) {
        const types = [{ id: '', name: '全部类型' }, ...res.data];
        this.setData({ serviceTypeOptions: types });
      }
    }).catch(() => {
      console.log('加载服务类型失败');
    });
  },

  loadProviders: function () {
    const params = {};
    if (this.data.currentStatus) params.status = this.data.currentStatus;
    if (this.data.currentLevel) params.level = this.data.currentLevel;
    if (this.data.currentServiceType) params.service_type = this.data.currentServiceType;
    if (this.data.currentRating) params.rating = this.data.currentRating;
    if (this.data.currentCount) params.count = this.data.currentCount;
    if (this.data.searchKeyword) params.keyword = this.data.searchKeyword;
    if (this.data.sortBy) {
      params.sort_by = this.data.sortBy;
      params.sort_order = this.data.sortOrder;
    }

    app.request({
      url: '/admin/providers',
      data: params
    }).then(res => {
      if (res.code === 0) {
        const providers = (res.data || []).map(item => ({
          ...item,
          service_types_display: item.service_types ? item.service_types.replace(/,/g, '、') : ''
        }));
        this.setData({ providers });
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
        this.setData({ providers: [] });
      }
    }).catch(() => {
      this.setData({ providers: [] });
    });
  },

  toggleFilterPanel: function () {
    this.setData({ showFilterPanel: !this.data.showFilterPanel });
  },

  filterByStatus: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ currentStatus: status });
    this.loadProviders();
  },

  filterByLevel: function (e) {
    const level = e.currentTarget.dataset.level;
    this.setData({ currentLevel: level });
    this.loadProviders();
  },

  filterByServiceType: function (e) {
    const typeId = e.currentTarget.dataset.type;
    const typeItem = this.data.serviceTypeOptions.find(t => t.id === typeId);
    
    // 如果不是"全部类型"且状态是禁用的
    if (typeId !== '' && typeItem && typeItem.status !== 1) {
      wx.showToast({
        title: '该服务类型已禁用',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    this.setData({ currentServiceType: typeId });
    this.loadProviders();
  },

  filterByRating: function (e) {
    const rating = e.currentTarget.dataset.rating;
    this.setData({ currentRating: rating });
    this.loadProviders();
  },

  filterByCount: function (e) {
    const count = e.currentTarget.dataset.count;
    this.setData({ currentCount: count });
    this.loadProviders();
  },

  clearFilter: function (e) {
    const type = e.currentTarget.dataset.type;
    const data = {};
    switch(type) {
      case 'status': data.currentStatus = ''; break;
      case 'level': data.currentLevel = ''; break;
      case 'serviceType': data.currentServiceType = ''; break;
      case 'rating': data.currentRating = ''; break;
      case 'count': data.currentCount = ''; break;
    }
    this.setData(data);
    this.loadProviders();
  },

  resetFilters: function () {
    this.setData({
      currentStatus: '',
      currentLevel: '',
      currentServiceType: '',
      currentRating: '',
      currentCount: ''
    });
    this.loadProviders();
  },

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
    this.loadProviders();
  },

  sortByRating: function () {
    const order = this.data.sortBy === 'rating' && this.data.sortOrder === 'desc' ? 'asc' : 'desc';
    this.setData({ sortBy: 'rating', sortOrder: order });
    this.loadProviders();
  },

  sortByCount: function () {
    const order = this.data.sortBy === 'service_count' && this.data.sortOrder === 'desc' ? 'asc' : 'desc';
    this.setData({ sortBy: 'service_count', sortOrder: order });
    this.loadProviders();
  },

  sortByTime: function () {
    const order = this.data.sortBy === 'create_time' && this.data.sortOrder === 'desc' ? 'asc' : 'desc';
    this.setData({ sortBy: 'create_time', sortOrder: order });
    this.loadProviders();
  },

  goToAddProvider: function () {
    wx.navigateTo({ url: '/pages/admin-providers/detail/detail' });
  },

  goToProviderDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin-providers/detail/detail?id=${id}` });
  },

  getLevelColor: function (level) {
    const colors = {
      0: '#91d5ff',
      1: '#d9d9d9',
      2: '#faad14',
      3: '#ff6b6b'
    };
    return colors[level] || '#91d5ff';
  },

  getStatusText: function (status) {
    const texts = {
      idle: '空闲',
      busy: '忙碌',
      offline: '离线',
      disabled: '已禁用'
    };
    return texts[status] || '离线';
  },

  getServiceTypes: function (types) {
    return types ? types.replace(/,/g, '、') : '';
  },

  getStatusLabel: function (value) {
    const option = this.data.statusOptions.find(o => o.value === value);
    return option ? option.label : value;
  },

  getLevelLabel: function (value) {
    const option = this.data.levelOptions.find(o => o.value === value);
    return option ? option.label : value;
  },

  getServiceTypeLabel: function (value) {
    const option = this.data.serviceTypeOptions.find(o => o.id === value);
    return option ? option.name : value;
  },

  getRatingLabel: function (value) {
    const option = this.data.ratingOptions.find(o => o.value === value);
    return option ? option.label : value;
  },

  getCountLabel: function (value) {
    const option = this.data.countOptions.find(o => o.value === value);
    return option ? option.label : value;
  }
});