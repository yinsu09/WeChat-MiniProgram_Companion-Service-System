const app = getApp();

Page({
  data: {
    currentTab: 'all',
    unreadCount: 0,
    notifications: [],
    filteredNotifications: []
  },

  onLoad() {
    this.loadNotifications();
  },

  onShow() {
    this.loadNotifications();
  },

  switchTab(e) {
    this.setData({ currentTab: e.currentTarget.dataset.tab });
    this.filterNotifications();
  },

  filterNotifications() {
    const { notifications, currentTab } = this.data;
    if (currentTab === 'all') {
      this.setData({ filteredNotifications: notifications });
    } else {
      this.setData({
        filteredNotifications: notifications.filter((n) => n.type === currentTab)
      });
    }
  },

  loadNotifications() {
    app.request({ url: '/user/notifications' }).then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({
          notifications: res.data.list || [],
          unreadCount: res.data.unreadCount || 0
        });
      } else {
        this.setData({ notifications: [], unreadCount: 0 });
      }
      this.filterNotifications();
    }).catch(() => {
      this.setData({ notifications: [], unreadCount: 0 });
      this.filterNotifications();
    });
  },

  viewDetail(e) {
    const notification = e.currentTarget.dataset.notification;
    if (!notification.is_read) {
      this.markAsRead(notification.id);
    }
    wx.showModal({
      title: notification.title,
      content: `${notification.content}\n\n时间：${notification.created_at}`,
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  markAsRead(notificationId) {
    const notifications = this.data.notifications.map((n) => (
      n.id === notificationId ? { ...n, is_read: true } : n
    ));
    this.setData({
      notifications,
      unreadCount: notifications.filter((n) => !n.is_read).length
    });
    this.filterNotifications();
    app.request({
      url: '/user/notifications/read',
      method: 'PUT',
      data: { notificationId }
    }).catch(() => {});
  }
});
