const app = getApp();

function buildAvailableDates(weekdayIds) {
  const WEEKDAY_MAP = { 0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六' };
  const ids = weekdayIds && weekdayIds.length ? weekdayIds : [1, 2, 3, 4, 5];
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 21; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow = d.getDay();
    if (ids.includes(dow)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      dates.push({ date: dateStr, label: `${dateStr} ${WEEKDAY_MAP[dow]}` });
    }
  }
  return dates;
}

Page({
  data: {
    step: 1,
    types: [],
    timeSlots: [],
    availableDates: [],
    providers: [],
    checkoutCoupons: [],
    selectedType: null,
    selectedProvider: null,
    requirements: '',
    selectedDate: '',
    selectedDateLabel: '',
    selectedTimeSlot: null,
    dateIndex: 0,
    slotIndex: 0,
    selectedCoupon: null,
    basePrice: 100,
    discountAmount: 0,
    totalPrice: '100.00',
    assignMode: 'manual',
    userPoints: 0,
    loading: false,
    assignConfig: { user_select_enabled: true, auto_assign_enabled: true }
  },

  onLoad(options) {
    this.loadTypes(options.typeId);
    this.loadScheduleOptions();
    this.loadAssignConfig();
  },

  loadAssignConfig() {
    app.request({ url: '/services/assign-config' }).then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({ assignConfig: res.data });
        if (res.data.user_select_enabled === false) {
          this.setData({ assignMode: 'system' });
        }
      }
    }).catch(() => {});
  },

  loadScheduleOptions() {
    app.request({ url: '/services/types/schedule/options' }).then((res) => {
      if (res.code === 0) {
        const timeSlots = res.data.time_slots || [];
        this.setData({
          timeSlots,
          selectedTimeSlot: timeSlots[0] || null,
          availableDates: buildAvailableDates([1, 2, 3, 4, 5, 6, 0])
        });
        if (this.data.availableDates.length) {
          this.setData({
            selectedDate: this.data.availableDates[0].date,
            selectedDateLabel: this.data.availableDates[0].label
          });
        }
      }
    }).catch(() => {});
  },

  loadTypes(presetTypeId) {
    this.setData({ loading: true });
    app.request({ url: '/services/types' }).then((res) => {
      if (res.code === 0) {
        const types = (res.data || []).map((item) => ({
          ...item,
          enabled: Number(item.status) === 1
        }));
        this.setData({ types, loading: false });
        if (presetTypeId) {
          const type = types.find((t) => String(t.id) === String(presetTypeId) && t.enabled);
          if (type) this.selectType({ currentTarget: { dataset: { type } } });
        }
      } else {
        this.setData({ loading: false });
      }
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '加载服务类型失败', icon: 'none' });
    });
  },

  selectType(e) {
    const type = e.currentTarget.dataset.type;
    if (!type || !type.enabled) {
      wx.showToast({ title: '该服务类型不可选', icon: 'none' });
      return;
    }
    this.setData({ step: 2, selectedType: type, selectedProvider: null, providers: [] });
  },

  onRequirementsInput(e) {
    this.setData({ requirements: e.detail.value });
  },

  onDateChange(e) {
    const index = Number(e.detail.value);
    const item = this.data.availableDates[index];
    if (!item) return;
    this.setData({
      dateIndex: index,
      selectedDate: item.date,
      selectedDateLabel: item.label
    });
  },

  onSlotChange(e) {
    const index = Number(e.detail.value);
    const slot = this.data.timeSlots[index];
    if (!slot) return;
    this.setData({ slotIndex: index, selectedTimeSlot: slot });
  },

  setAssignMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ assignMode: mode, selectedProvider: null });
  },

  goToProviderStep() {
    const { selectedType, requirements, selectedDate, selectedTimeSlot, assignMode } = this.data;
    if (!requirements.trim()) {
      wx.showToast({ title: '请填写具体要求', icon: 'none' });
      return;
    }
    if (!selectedDate || !selectedTimeSlot) {
      wx.showToast({ title: '请选择日期和时段', icon: 'none' });
      return;
    }

    if (assignMode === 'system') {
      this.setData({ step: 4, selectedProvider: null, basePrice: 100, totalPrice: '100.00', discountAmount: 0, selectedCoupon: null });
      this.loadCheckoutCoupons();
      return;
    }

    this.setData({ step: 3, loading: true, selectedProvider: null });
    app.request({
      url: `/services/types/${selectedType.id}/available-providers`,
      data: {
        scheduled_date: selectedDate,
        scheduled_time: selectedTimeSlot.start
      }
    }).then((res) => {
      const providers = (res.data || []).map((item) => ({
        ...item,
        avatar_url: app.resolveImageUrl(item.avatar_url)
      }));
      this.setData({ providers, loading: false });
      if (!providers.length) {
        wx.showToast({ title: '该时段暂无空闲服务人员', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ providers: [], loading: false });
      wx.showToast({ title: '查询服务人员失败', icon: 'none' });
    });
  },

  selectProvider(e) {
    const provider = e.currentTarget.dataset.provider;
    if (!provider) return;
    this.setData({ selectedProvider: provider, step: 4, basePrice: 100, totalPrice: '100.00', discountAmount: 0, selectedCoupon: null });
    this.loadCheckoutCoupons();
  },

  viewProviderDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/provider-detail/provider-detail?id=${id}` });
  },

  loadCheckoutCoupons() {
    app.request({
      url: '/orders/checkout-coupons',
      data: { amount: this.data.basePrice }
    }).then((res) => {
      if (res.code === 0) {
        this.setData({ checkoutCoupons: res.data || [] });
      }
    }).catch(() => {});
    app.request({ url: '/user/coupons' }).then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({ userPoints: res.data.userPoints || 0 });
      }
    }).catch(() => {});
  },

  selectCoupon(e) {
    const coupon = e.currentTarget.dataset.coupon;
    if (!coupon || !coupon.usable) {
      wx.showToast({ title: '该优惠券不可用', icon: 'none' });
      return;
    }
    this.applyCoupon(coupon);
  },

  clearCoupon() {
    this.setData({
      selectedCoupon: null,
      discountAmount: 0,
      totalPrice: Number(this.data.basePrice).toFixed(2)
    });
  },

  applyCoupon(coupon) {
    const base = Number(this.data.basePrice);
    let discount = 0;
    let finalPrice = base;

    if (coupon.type_name === '折扣券' || Number(coupon.type) === 2) {
      const value = Number(coupon.value);
      const ratio = value > 1 && value <= 10 ? value / 10 : value / 100;
      finalPrice = Number((base * ratio).toFixed(2));
      discount = Number((base - finalPrice).toFixed(2));
    } else {
      discount = Math.min(Number(coupon.value) || 0, base);
      finalPrice = Number((base - discount).toFixed(2));
    }

    this.setData({
      selectedCoupon: coupon,
      discountAmount: discount,
      totalPrice: finalPrice.toFixed(2)
    });
  },

  submitOrder() {
    const {
      selectedType,
      selectedProvider,
      requirements,
      selectedDate,
      selectedTimeSlot,
      selectedCoupon,
      assignMode
    } = this.data;

    if (assignMode === 'manual' && !selectedProvider) {
      wx.showToast({ title: '请选择服务人员', icon: 'none' });
      return;
    }

    app.request({
      url: '/orders/custom',
      method: 'POST',
      data: {
        type_id: selectedType.id,
        provider_id: assignMode === 'manual' ? selectedProvider.id : null,
        assign_type: assignMode === 'system' ? 0 : 1,
        custom_requirements: requirements.trim(),
        scheduled_date: selectedDate,
        scheduled_time: selectedTimeSlot.start,
        user_coupon_id: selectedCoupon ? selectedCoupon.id : null
      }
    }).then((res) => {
      if (res.code === 0) {
        wx.showToast({ title: '下单成功', icon: 'success' });
        setTimeout(() => wx.navigateTo({ url: '/pages/orders/orders' }), 1500);
      } else {
        wx.showToast({ title: res.message || '下单失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '下单失败', icon: 'none' });
    });
  },

  goBackStep() {
    const { step, assignMode } = this.data;
    if (step === 4) {
      this.setData({ step: assignMode === 'system' ? 2 : 3, selectedProvider: null });
    } else if (step === 3) {
      this.setData({ step: 2, providers: [] });
    } else if (step === 2) {
      this.setData({ step: 1, selectedType: null });
    } else {
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/services/services' }) });
    }
  }
});
