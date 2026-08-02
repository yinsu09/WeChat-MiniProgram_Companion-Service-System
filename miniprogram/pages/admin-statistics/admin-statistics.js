const app = getApp();

Page({
  data: {
    today: '',
    startDate: '',
    endDate: '',
    currentTab: 'sales',
    tabOptions: [
      { key: 'sales', label: '销售统计' },
      { key: 'hot', label: '热门分析' },
      { key: 'user', label: '用户分析' },
      { key: 'refund', label: '退费分析' },
      { key: 'trend', label: '分级趋势' }
    ],
    stats: {
      totalRevenue: 0,
      totalOrders: 0,
      totalUsers: 0,
      refundRate: 0,
      revenueGrowth: 0,
      orderGrowth: 0,
      userGrowth: 0,
      refundRateChange: 0
    },
    salesData: [],
    hotServices: [],
    hotProviders: [],
    userStats: {
      averageOrder: 0,
      repeatRate: 0,
      activeUsers: 0,
      newUsers: 0,
      levelDistribution: {
        gold: 0,
        silver: 0,
        bronze: 0
      }
    },
    refundReasons: [],
    refundStats: {
      totalRefunds: 0,
      totalAmount: 0,
      averageAmount: 0,
      successRate: 0
    },
    levelTrend: [],
    levelStats: {
      bronze: 0,
      silver: 0,
      gold: 0,
      bronzeChange: 0,
      silverChange: 0,
      goldChange: 0
    }
  },

  onLoad: function () {
    app.switchRole('admin');
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const lastMonthStr = lastMonth.toISOString().split('T')[0];

    this.setData({
      today: dateStr,
      startDate: lastMonthStr,
      endDate: dateStr
    });

    this.loadData();
  },

  loadData: function () {
    app.request({
      url: '/admin/statistics',
      data: {
        start_date: this.data.startDate,
        end_date: this.data.endDate
      }
    }).then(res => {
      if (res.code === 0 && res.data) {
        const data = res.data;
        const stats = {
          ...this.data.stats,
          ...(data.stats || {})
        };
        stats.totalRevenueText = stats.totalRevenueText
          || this.formatNumber(stats.totalRevenue);
        const rankColors = { 1: '#ff6b6b', 2: '#faad14', 3: '#d9d9d9' };
        const levelColors = { 1: '#d9d9d9', 2: '#faad14', 3: '#ff6b6b' };
        this.setData({
          stats,
          salesData: data.salesData || [],
          hotServices: (data.hotServices || []).map((item) => ({
            ...item,
            rankColor: rankColors[item.rank] || '#999'
          })),
          hotProviders: (data.hotProviders || []).map((item) => ({
            ...item,
            rankColor: rankColors[item.rank] || '#999',
            levelColor: levelColors[item.level] || '#d9d9d9'
          })),
          userStats: data.userStats || this.data.userStats,
          refundReasons: data.refundReasons || [],
          refundStats: data.refundStats || this.data.refundStats,
          levelTrend: data.levelTrend || [],
          levelStats: data.levelStats || this.data.levelStats
        });
      }
    }).catch(() => {
      wx.showToast({ title: '获取统计数据失败', icon: 'none' });
    });
  },

  onStartDateChange: function (e) {
    this.setData({ startDate: e.detail.value });
    this.loadData();
  },

  onEndDateChange: function (e) {
    this.setData({ endDate: e.detail.value });
    this.loadData();
  },

  refreshData: function () {
    this.loadData();
    wx.showToast({ title: '数据已刷新', icon: 'none' });
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },

  exportReport: function () {
    wx.showModal({
      title: '导出报表',
      content: '确定要导出当前时间范围内的统计报表吗？将生成 CSV 文件供下载。',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '生成中' });
          app.request({
            url: '/admin/statistics/export',
            data: {
              start_date: this.data.startDate,
              end_date: this.data.endDate
            }
          }).then((res) => {
            wx.hideLoading();
            if (res.code === 0 && res.data && res.data.downloadUrl) {
              const base = app.globalData.baseUrl.replace(/\/api$/, '');
              const token = app.getSession('admin').token || app.globalData.token;
              wx.downloadFile({
                url: `${base}${res.data.downloadUrl}`,
                header: { Authorization: `Bearer ${token}` },
                success: (dl) => {
                  if (dl.statusCode === 200) {
                    wx.openDocument({
                      filePath: dl.tempFilePath,
                      showMenu: true,
                      success: () => {
                        wx.showToast({ title: '报表已打开', icon: 'success' });
                      },
                      fail: () => {
                        wx.saveFile({
                          tempFilePath: dl.tempFilePath,
                          success: () => {
                            wx.showToast({ title: '已保存到本地', icon: 'success' });
                          },
                          fail: () => {
                            wx.showToast({ title: '请通过菜单保存文件', icon: 'none' });
                          }
                        });
                      }
                    });
                  } else {
                    wx.showToast({ title: '下载失败', icon: 'none' });
                  }
                },
                fail: () => {
                  wx.showToast({ title: '下载失败', icon: 'none' });
                }
              });
            } else {
              wx.showToast({ title: res.message || '导出失败', icon: 'none' });
            }
          }).catch(() => {
            wx.hideLoading();
            wx.showToast({ title: '导出失败', icon: 'none' });
          });
        }
      }
    });
  },

  formatNumber: function (num) {
    const value = parseFloat(num);
    if (Number.isNaN(value)) return '0.00';
    if (value >= 10000) {
      return (value / 10000).toFixed(1) + '万';
    }
    return value.toFixed(2);
  },

  getRankColor: function (rank) {
    const colors = {
      1: '#ff6b6b',
      2: '#faad14',
      3: '#d9d9d9'
    };
    return colors[rank] || '#999';
  },

  getLevelColor: function (level) {
    const colors = {
      1: '#d9d9d9',
      2: '#faad14',
      3: '#ff6b6b'
    };
    return colors[level] || '#d9d9d9';
  }
});
