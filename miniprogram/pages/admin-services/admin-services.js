const app = getApp();

Page({
  data: {
    services: [],
    searchKeyword: '',
    currentCategory: 'regular',
    currentStatus: '',
    currentType: '',
    categoryOptions: [
      { label: '常规服务', value: 'regular', desc: '服务人员发布' },
      { label: '指派服务', value: 'custom', desc: '用户指定' },
      { label: '组团游', value: 'group', desc: '一次性活动' }
    ],
    regularStatusOptions: [
      { label: '全部', value: '' },
      { label: '上架', value: 'online' },
      { label: '下架', value: 'offline' }
    ],
    lifecycleStatusOptions: [
      { label: '全部', value: '' },
      { label: '进行中', value: 'ongoing' },
      { label: '已完成', value: 'completed' }
    ],
    typeOptions: []
  },

  onLoad: function () {
    this.loadTypeOptions();
    this.loadServices();
  },

  onShow: function () {
    this.loadTypeOptions();
    this.loadServices();
  },

  loadTypeOptions: function () {
    app.request({
      url: '/admin/service-types/all'
    }).then(res => {
      if (res.code === 0) {
        const options = [{ id: '', name: '全部类型' }, ...res.data.map(t => ({ id: t.id, name: t.name, status: t.status }))];
        this.setData({ typeOptions: options });
      }
    }).catch(() => {});
  },

  loadServices: function () {
    const { currentCategory, currentStatus, currentType, searchKeyword } = this.data;
    const params = { category: currentCategory };

    if (currentCategory === 'regular') {
      if (currentStatus === 'online') params.status = 1;
      else if (currentStatus === 'offline') params.status = 0;
    } else if (currentStatus) {
      params.status = currentStatus;
    }

    if (currentType && currentCategory !== 'group') {
      params.type_id = currentType;
    }
    if (searchKeyword) {
      params.keyword = searchKeyword;
    }

    app.request({
      url: '/admin/services',
      data: params
    }).then(res => {
      if (res.code === 0) {
        this.setData({ services: res.data || [] });
      } else {
        this.setData({ services: [] });
      }
    }).catch(() => {
      this.setData({ services: [] });
    });
  },

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
    this.loadServices();
  },

  switchCategory: function (e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ currentCategory: category, currentStatus: '', currentType: '' });
    this.loadServices();
  },

  filterByStatus: function (e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ currentStatus: status });
    this.loadServices();
  },

  filterByType: function (e) {
    const type = e.currentTarget.dataset.type;
    const status = e.currentTarget.dataset.status;

    if (status === 0) {
      wx.showToast({ title: '该类型已禁用', icon: 'none' });
      return;
    }

    this.setData({ currentType: type });
    this.loadServices();
  },

  goToServiceTypes: function () {
    wx.navigateTo({ url: '/pages/admin-services/types/types' });
  },

  goToServiceDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    const category = e.currentTarget.dataset.category || this.data.currentCategory;
    wx.navigateTo({
      url: `/pages/admin-services/detail/detail?id=${id}&category=${category}`
    });
  },

  toggleStatus: function (e) {
    const id = e.currentTarget.dataset.id;
    const statusKey = e.currentTarget.dataset.status;

    if (statusKey !== 'online' && statusKey !== 'offline') return;

    const newStatus = statusKey === 'online' ? 0 : 1;

    app.request({
      url: `/admin/services/${id}/status`,
      method: 'PUT',
      data: { status: newStatus }
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: newStatus === 1 ? '上架成功' : '下架成功', icon: 'success' });
        this.loadServices();
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  }
});
