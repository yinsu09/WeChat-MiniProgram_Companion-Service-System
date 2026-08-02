const app = getApp();

Page({
  data: {
    order: null,
    canModifySchedule: false,
    bookingNext: false,
    editingSchedule: false,
    availableDates: [],
    timeSlots: [],
    dateIndex: 0,
    slotIndex: 0,
    selectedDate: '',
    selectedDateLabel: '',
    selectedTimeSlot: null,
    scheduleChanged: false,
    statusMap: {
      0: '待支付',
      1: '待接单',
      2: '待服务',
      3: '服务中',
      4: '已完成',
      5: '已取消',
      6: '已取消',
      7: '已取消'
    },
    statusColors: {
      0: '#FFD700',
      1: '#1E90FF',
      2: '#32CD32',
      3: '#FF8C00',
      4: '#999',
      5: '#DC143C',
      6: '#FF69B4',
      7: '#9370DB'
    },
    statusHistory: []
  },

  onLoad: function (options) {
    if (options.id) {
      this.orderId = options.id;
      this.loadOrder(options.id);
    }
  },

  loadOrder: function (id) {
    app.request({
      url: `/orders/${id}`
    }).then(res => {
      if (res.code === 0 && res.data) {
        this.applyOrderData(res.data, false);
      } else {
        wx.showToast({ title: res.message || '加载订单失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '加载订单失败', icon: 'none' });
    });
  },

  applyOrderData: function (order, keepEditing) {
    const canModifySchedule = this.checkCanModifySchedule(order);
    const schedule = this.initScheduleOptions(order);

    this.originalSchedule = {
      date: this.formatDateValue(order.scheduled_date),
      time: this.normalizeTimeValue(order.scheduled_time)
    };

    this.setData({
      order,
      canModifySchedule,
      editingSchedule: !!keepEditing && !order.can_book_next,
      bookingNext: !!keepEditing && !!order.can_book_next,
      statusHistory: this.getStatusHistory(order),
      ...schedule,
      scheduleChanged: false
    });
  },

  checkCanModifySchedule: function (order) {
    if (!order) return false;
    if (order.can_book_next) return false;
    if (order.can_modify_schedule === false) return false;
    if (order.is_group_tour || order.group_activity_id) return false;
    return [1, 2].includes(Number(order.status));
  },

  initScheduleOptions: function (order) {
    const options = order.schedule_options || {};
    const availableDates = options.available_dates || [];
    const timeSlots = options.time_slots || [];

    const currentDate = this.formatDateValue(order.scheduled_date);
    const currentTime = this.normalizeTimeValue(order.scheduled_time);

    let dateIndex = availableDates.findIndex((d) => d.date === currentDate);
    if (dateIndex < 0) dateIndex = 0;

    let slotIndex = timeSlots.findIndex(
      (t) => t.start === currentTime || t.name === order.scheduled_time
    );
    if (slotIndex < 0) slotIndex = 0;

    const selectedDateItem = availableDates[dateIndex] || null;
    const selectedTimeSlot = timeSlots[slotIndex] || null;

    return {
      availableDates,
      timeSlots,
      dateIndex,
      slotIndex,
      selectedDate: selectedDateItem ? selectedDateItem.date : currentDate,
      selectedDateLabel: selectedDateItem ? selectedDateItem.label : currentDate,
      selectedTimeSlot
    };
  },

  getDisplayTime: function () {
    const order = this.data.order;
    if (!order) return '';
    if ((this.data.editingSchedule || this.data.bookingNext) && this.data.selectedTimeSlot) {
      return this.data.selectedTimeSlot.name;
    }
    return order.scheduled_time || '';
  },

  checkScheduleChanged: function (date, timeSlot) {
    const orig = this.originalSchedule || {};
    const newDate = date || this.data.selectedDate;
    const newTime = timeSlot ? timeSlot.start : this.normalizeTimeValue(this.data.order && this.data.order.scheduled_time);
    return newDate !== orig.date || newTime !== orig.time;
  },

  formatDateValue: function (value) {
    if (!value) return '';
    return String(value).split('T')[0].split(' ')[0];
  },

  normalizeTimeValue: function (value) {
    if (!value) return '';
    const str = String(value).trim();
    if (str.includes('-') && str.includes(':')) {
      return str.split('-')[0].trim();
    }
    return str.slice(0, 5);
  },

  getStatusHistory: function (order) {
    const history = [];
    const now = new Date().toLocaleString('zh-CN');

    if (order.status >= 1) {
      history.unshift({ status: '订单创建成功', time: order.created_at || now });
    }
    if (order.status >= 2) {
      history.unshift({ status: '服务人员已接单', time: now });
    }
    if (order.status >= 3) {
      history.unshift({ status: '服务进行中', time: now });
    }
    if (order.status >= 4) {
      history.unshift({ status: '服务已完成', time: now });
    }

    return history.length > 0 ? history : [{ status: '订单创建成功', time: now }];
  },

  getLevelName: function (level) {
    if (level >= 3) return '金牌服务';
    if (level >= 2) return '银牌服务';
    return '铜牌服务';
  },

  startEditSchedule: function () {
    if (!this.data.canModifySchedule) {
      wx.showToast({ title: '当前订单不可修改预约', icon: 'none' });
      return;
    }
    if (!this.data.availableDates.length || !this.data.timeSlots.length) {
      wx.showToast({ title: '暂无可选预约时段', icon: 'none' });
      return;
    }
    this.setData({ editingSchedule: true, bookingNext: false, scheduleChanged: false });
  },

  startBookNext: function () {
    const order = this.data.order;
    if (!order || !order.can_book_next) {
      wx.showToast({ title: '当前不可预约下次', icon: 'none' });
      return;
    }
    const schedule = this.initScheduleOptions(order);
    if (!schedule.availableDates.length || !schedule.timeSlots.length) {
      wx.showToast({ title: '暂无可选预约时段', icon: 'none' });
      return;
    }

    schedule.dateIndex = 0;
    schedule.selectedDate = schedule.availableDates[0].date;
    schedule.selectedDateLabel = schedule.availableDates[0].label;
    schedule.slotIndex = 0;
    schedule.selectedTimeSlot = schedule.timeSlots[0];

    this.setData({
      bookingNext: true,
      editingSchedule: false,
      scheduleChanged: true,
      ...schedule
    });
  },

  cancelBookNext: function () {
    const order = this.data.order;
    const schedule = this.initScheduleOptions(order);
    this.setData({
      bookingNext: false,
      scheduleChanged: false,
      ...schedule
    });
  },

  saveBookNext: function () {
    if (!this.data.bookingNext) return;

    const order = this.data.order;
    const timeSlot = this.data.selectedTimeSlot;
    if (!order || !this.data.selectedDate || !timeSlot) {
      wx.showToast({ title: '请选择预约日期和时段', icon: 'none' });
      return;
    }

    const displayTime = timeSlot.name || timeSlot.start;
    wx.showModal({
      title: '预约下次服务',
      content: `确定为下次服务预约 ${this.data.selectedDate} ${displayTime} 吗？`,
      success: (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '提交中...' });
        app.request({
          url: `/orders/${order.id}/book-next`,
          method: 'POST',
          data: {
            scheduled_date: this.data.selectedDate,
            scheduled_time: timeSlot.start
          }
        }).then((result) => {
          wx.hideLoading();
          if (result.code === 0) {
            wx.showToast({ title: result.message || '预约成功', icon: 'success' });
            this.applyOrderData(result.data, false);
          } else {
            wx.showToast({ title: result.message || '预约失败', icon: 'none' });
          }
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '预约失败', icon: 'none' });
        });
      }
    });
  },

  cancelEditSchedule: function () {
    const order = this.data.order;
    const schedule = this.initScheduleOptions(order);
    this.setData({
      editingSchedule: false,
      scheduleChanged: false,
      ...schedule
    });
  },

  onDateChange: function (e) {
    if (!this.data.editingSchedule && !this.data.bookingNext) return;
    const index = Number(e.detail.value);
    const dateItem = this.data.availableDates[index];
    if (!dateItem) return;

    this.setData({
      dateIndex: index,
      selectedDate: dateItem.date,
      selectedDateLabel: dateItem.label,
      scheduleChanged: this.checkScheduleChanged(dateItem.date, this.data.selectedTimeSlot)
    });
  },

  onSlotChange: function (e) {
    if (!this.data.editingSchedule && !this.data.bookingNext) return;
    const index = Number(e.detail.value);
    const slot = this.data.timeSlots[index];
    if (!slot) return;

    this.setData({
      slotIndex: index,
      selectedTimeSlot: slot,
      scheduleChanged: this.checkScheduleChanged(this.data.selectedDate, slot)
    });
  },

  saveSchedule: function () {
    if (!this.data.editingSchedule) return;

    const order = this.data.order;
    const timeSlot = this.data.selectedTimeSlot;
    if (!order || !this.data.selectedDate || !timeSlot) {
      wx.showToast({ title: '请选择预约日期和时段', icon: 'none' });
      return;
    }

    if (!this.data.scheduleChanged) {
      wx.showToast({ title: '请先修改预约时间', icon: 'none' });
      return;
    }

    const displayTime = timeSlot.name || timeSlot.start;
    wx.showModal({
      title: '修改预约',
      content: `确定将预约时间修改为 ${this.data.selectedDate} ${displayTime} 吗？`,
      success: (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '提交中...' });
        app.request({
          url: `/orders/${order.id}`,
          method: 'PUT',
          data: {
            scheduled_date: this.data.selectedDate,
            scheduled_time: timeSlot.start
          }
        }).then(result => {
          wx.hideLoading();
          if (result.code === 0) {
            wx.showToast({ title: '修改成功', icon: 'success' });
            this.loadOrder(order.id);
          } else {
            wx.showToast({ title: result.message || '修改失败', icon: 'none' });
          }
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '修改失败', icon: 'none' });
        });
      }
    });
  },

  contactProvider: function () {
    const phone = this.data.order && this.data.order.provider_phone;
    if (phone) {
      wx.makePhoneCall({
        phoneNumber: phone,
        fail: () => {
          wx.showToast({ title: '拨打电话失败', icon: 'none' });
        }
      });
    } else {
      wx.showToast({ title: '暂无联系电话', icon: 'none' });
    }
  },

  cancelOrder: function () {
    const order = this.data.order;

    wx.showModal({
      title: '取消订单',
      content: '取消订单将同时提交退款申请，退款金额按平台规则计算，需管理员审核。确定继续吗？',
      success: (res) => {
        if (res.confirm) {
          app.request({
            url: `/orders/${order.id}/cancel`,
            method: 'POST'
          }).then(result => {
            if (result.code === 0) {
              wx.showToast({ title: result.message || '订单已取消', icon: 'success' });
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              wx.showToast({ title: result.message || '取消失败', icon: 'none' });
            }
          }).catch(() => {
            wx.showToast({ title: '取消失败', icon: 'none' });
          });
        }
      }
    });
  },

  canCancelOrder: function (order) {
    if (!order) return false;
    return [1, 2, 3].includes(Number(order.status));
  },

  goToReview: function () {
    wx.navigateTo({
      url: `/pages/review/review?order_id=${this.data.order.id}`
    });
  },

  goProviderDetail: function () {
    const order = this.data.order;
    if (!order || !order.provider_id) return;
    wx.navigateTo({
      url: `/pages/provider-detail/provider-detail?id=${order.provider_id}`
    });
  },

  confirmComplete: function () {
    const order = this.data.order;
    wx.showModal({
      title: '确认完成',
      content: '确认本次服务已完成？需服务人员同时确认后订单才会结束。',
      success: (res) => {
        if (!res.confirm) return;
        app.request({
          url: `/orders/${order.id}/confirm-complete`,
          method: 'POST'
        }).then((result) => {
          if (result.code === 0) {
            wx.showToast({ title: result.message || '已确认', icon: 'success' });
            this.loadOrder(order.id);
          } else {
            wx.showToast({ title: result.message || '操作失败', icon: 'none' });
          }
        }).catch(() => {
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
      }
    });
  },

  pauseService: function () {
    const order = this.data.order;
    wx.showModal({
      title: '暂停服务',
      content: '确定要暂停当前服务吗？',
      success: (res) => {
        if (!res.confirm) return;
        app.request({
          url: `/orders/${order.id}/pause`,
          method: 'POST'
        }).then((result) => {
          if (result.code === 0) {
            wx.showToast({ title: '服务已暂停', icon: 'success' });
            this.loadOrder(order.id);
          } else {
            wx.showToast({ title: result.message || '操作失败', icon: 'none' });
          }
        });
      }
    });
  },

  resumeService: function () {
    const order = this.data.order;
    app.request({
      url: `/orders/${order.id}/resume`,
      method: 'POST'
    }).then((result) => {
      if (result.code === 0) {
        wx.showToast({ title: '服务已恢复', icon: 'success' });
        this.loadOrder(order.id);
      } else {
        wx.showToast({ title: result.message || '操作失败', icon: 'none' });
      }
    });
  },

  goAfterSales: function () {
    const order = this.data.order;
    wx.navigateTo({
      url: `/pages/after-sales/after-sales?order_id=${order.id}`
    });
  }
});
