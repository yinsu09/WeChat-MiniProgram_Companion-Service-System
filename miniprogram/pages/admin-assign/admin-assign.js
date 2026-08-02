const app = getApp();

Page({
  data: {
    rules: {
      user_select_enabled: true,
      auto_assign_enabled: true,
      prefer_same_city: true,
      candidate_count: 5,
      distance_weight: 25,
      level_weight: 20,
      rating_weight: 20,
      mutual_rating_weight: 15,
      service_count_weight: 10,
      response_speed_weight: 10,
      max_distance: 50,
      min_level: 1,
      min_level_index: 0,
      min_rating: 3.5,
      exclude_busy: true,
      assign_timeout: 15,
      max_retries: 3,
      auto_to_manual: true
    },
    levelOptions: [
      { level: 1, name: '铜牌及以上' },
      { level: 2, name: '银牌及以上' },
      { level: 3, name: '金牌服务' }
    ],
    totalWeight: 100
  },

  onLoad: function () {
    this.loadRules();
  },

  loadRules: function () {
    app.request({
      url: '/admin/assign/rules'
    }).then(res => {
      if (res.code === 0) {
        const data = res.data;
        data.min_level_index = this.data.levelOptions.findIndex(l => l.level === data.min_level);
        if (data.min_level_index === -1) {
          data.min_level_index = 0;
        }
        this.setData({ rules: data }, () => {
          this.updateTotalWeight();
        });
      }
    }).catch(() => {
      console.log('使用默认指派规则');
    });
  },

  updateTotalWeight: function () {
    const rules = this.data.rules;
    const total = rules.distance_weight + rules.level_weight + rules.rating_weight +
                  rules.mutual_rating_weight + rules.service_count_weight + rules.response_speed_weight;
    this.setData({ totalWeight: total });
  },

  toggleUserSelect: function (e) {
    this.setData({ 'rules.user_select_enabled': e.detail.value });
  },

  toggleAutoAssign: function (e) {
    this.setData({ 'rules.auto_assign_enabled': e.detail.value });
  },

  toggleSameCity: function (e) {
    this.setData({ 'rules.prefer_same_city': e.detail.value });
  },

  toggleExcludeBusy: function (e) {
    this.setData({ 'rules.exclude_busy': e.detail.value });
  },

  toggleAutoToManual: function (e) {
    this.setData({ 'rules.auto_to_manual': e.detail.value });
  },

  onCandidateCountChange: function (e) {
    this.setData({ 'rules.candidate_count': parseInt(e.detail.value) || 1 });
  },

  onDistanceWeightChange: function (e) {
    this.setData({ 'rules.distance_weight': e.detail.value }, () => {
      this.updateTotalWeight();
    });
  },

  onLevelWeightChange: function (e) {
    this.setData({ 'rules.level_weight': e.detail.value }, () => {
      this.updateTotalWeight();
    });
  },

  onRatingWeightChange: function (e) {
    this.setData({ 'rules.rating_weight': e.detail.value }, () => {
      this.updateTotalWeight();
    });
  },

  onMutualRatingWeightChange: function (e) {
    this.setData({ 'rules.mutual_rating_weight': e.detail.value }, () => {
      this.updateTotalWeight();
    });
  },

  onServiceCountWeightChange: function (e) {
    this.setData({ 'rules.service_count_weight': e.detail.value }, () => {
      this.updateTotalWeight();
    });
  },

  onResponseSpeedWeightChange: function (e) {
    this.setData({ 'rules.response_speed_weight': e.detail.value }, () => {
      this.updateTotalWeight();
    });
  },

  onMaxDistanceChange: function (e) {
    this.setData({ 'rules.max_distance': parseInt(e.detail.value) || 1 });
  },

  onMinLevelChange: function (e) {
    const index = e.detail.value;
    const level = this.data.levelOptions[index].level;
    this.setData({
      'rules.min_level_index': index,
      'rules.min_level': level
    });
  },

  onMinRatingChange: function (e) {
    this.setData({ 'rules.min_rating': parseFloat(e.detail.value) || 0 });
  },

  onAssignTimeoutChange: function (e) {
    this.setData({ 'rules.assign_timeout': parseInt(e.detail.value) || 1 });
  },

  onMaxRetriesChange: function (e) {
    this.setData({ 'rules.max_retries': parseInt(e.detail.value) || 1 });
  },

  saveRules: function () {
    const rules = { ...this.data.rules };
    delete rules.min_level_index;

    app.request({
      url: '/admin/assign/rules',
      method: 'PUT',
      data: rules
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  }
});