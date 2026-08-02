const app = getApp();

Page({
  data: {
    currentTab: 'all',
    unreadCount: 0,
    notifications: [],
    filteredNotifications: []
  },

  onLoad: function () {
    this.loadNotifications();
  },

  onShow: function () {
    this.loadNotifications();
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    this.filterNotifications();
  },

  filterNotifications: function () {
    const { notifications, currentTab } = this.data;
    if (currentTab === 'all') {
      this.setData({ filteredNotifications: notifications });
    } else {
      this.setData({
        filteredNotifications: notifications.filter(n => n.type === currentTab)
      });
    }
  },

  loadNotifications: function () {
    const providerId = this.getProviderId();

    app.request({
      url: '/provider/notifications',
      data: { provider_id: providerId }
    }).then(res => {
      if (res.code === 0 && res.data) {
        this.setData({
          notifications: res.data.list || [],
          unreadCount: res.data.unreadCount || 0
        });
        this.filterNotifications();
      } else {
        this.setData({ notifications: [], unreadCount: 0 });
        this.filterNotifications();
      }
    }).catch(() => {
      this.setData({ notifications: [], unreadCount: 0 });
      this.filterNotifications();
    });
  },

  getProviderId: function () {
    let providerInfo = app.globalData.providerInfo;
    if (!providerInfo) {
      providerInfo = wx.getStorageSync('userInfo');
    }
    return providerInfo ? providerInfo.id : null;
  },

  viewDetail: function (e) {
    const notification = e.currentTarget.dataset.notification;
    if (!notification.is_read) {
      this.markAsRead(notification.id);
    }

    if (notification.ref_type === 'group_invite' && notification.ref_id) {
      wx.showModal({
        title: notification.title,
        content: notification.content,
        confirmText: '接受',
        cancelText: '拒绝',
        success: (res) => {
          const activityId = notification.ref_id;
          if (res.confirm) {
            this.handleGroupInvite(activityId, 'accept');
          } else if (res.cancel) {
            this.handleGroupInvite(activityId, 'reject');
          }
        }
      });
      return;
    }

    wx.showModal({
      title: notification.title,
      content: notification.content + '\n\n时间：' + notification.created_at,
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  handleGroupInvite: function (activityId, action) {
    const url = action === 'accept'
      ? `/provider/group-tours/${activityId}/accept`
      : `/provider/group-tours/${activityId}/reject`;

    app.request({
      url,
      method: 'POST'
    }).then(result => {
      if (result.code === 0) {
        wx.showToast({ title: action === 'accept' ? '已接受' : '已拒绝', icon: 'success' });
      } else {
        wx.showToast({ title: result.message || '操作失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  markAsRead: function (notificationId) {
    // 先更新本地状态
    const notifications = this.data.notifications.map(n => {
      if (n.id === notificationId) {
        return { ...n, is_read: true };
      }
      return n;
    });
    const unreadCount = notifications.filter(n => !n.is_read).length;
    this.setData({ notifications, unreadCount });
    this.filterNotifications();
    
    // 调用后端接口标记已读
    app.request({
      url: '/provider/notifications/read',
      method: 'PUT',
      data: { notificationId }
    }).catch(() => {
      console.log('标记已读失败');
    });
  }
});