const app = getApp();

Page({
  data: {
    service: null,
    serviceImages: [],
    servicePrice: '0.00',
    totalPrice: '0.00',
    savedAmount: 0,
    selectedPurchase: null,
    purchaseTypes: [],
    availableDates: [],
    timeSlots: [],
    dateIndex: 0,
    slotIndex: 0,
    selectedDate: '',
    selectedDateLabel: '',
    selectedTimeSlot: null,
    selectedTimeDisplay: '',
    checkoutCoupons: [],
    selectedCoupon: null,
    discountAmount: 0,
    activeDiscount: null,
    originalPrice: '0.00',
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.loadService(options.id);
    } else {
      wx.showToast({ title: '服务不存在', icon: 'none' });
    }
  },

  loadService(id) {
    this.setData({ loading: true });
    app.request({ url: `/services/${id}` }).then((res) => {
      if (res.code === 0 && res.data) {
        const service = res.data;
        const publisher = service.publisher
          ? {
              ...service.publisher,
              avatar_url: app.resolveImageUrl(service.publisher.avatar_url)
            }
          : null;
        const servicePrice = Number(service.base_price || 0).toFixed(2);
        const purchaseTypes = service.purchase_options || [];
        const serviceImages = (service.image_list || []).map((url) => app.resolveImageUrl(url));
        const availableDates = service.available_dates || [];
        const timeSlots = service.time_slots || [];

        let displayPrice = servicePrice;
        if (service.active_discount) {
          displayPrice = Number(service.active_discount.discounted_price).toFixed(2);
        }

        this.setData({
          service: { ...service, publisher },
          servicePrice: displayPrice,
          originalPrice: servicePrice,
          activeDiscount: service.active_discount || null,
          serviceImages,
          purchaseTypes,
          availableDates,
          timeSlots,
          loading: false
        });

        if (purchaseTypes.length) {
          this.selectPurchase({ currentTarget: { dataset: { purchase: purchaseTypes[0] } } });
        } else {
          this.loadCheckoutCoupons(Number(servicePrice));
        }
        if (availableDates.length) {
          this.setData({
            dateIndex: 0,
            selectedDate: availableDates[0].date,
            selectedDateLabel: availableDates[0].label
          });
        }
        if (timeSlots.length) {
          this.setData({
            slotIndex: 0,
            selectedTimeSlot: timeSlots[0],
            selectedTimeDisplay: this.buildTimeDisplay(
              availableDates[0]?.date || '',
              timeSlots[0]?.name || ''
            )
          });
        }
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '加载服务失败', icon: 'none' });
    });
  },

  buildTimeDisplay(date, slotName) {
    if (!date || !slotName) return '';
    return `${date} ${slotName}`;
  },

  selectPurchase(e) {
    const purchase = e.currentTarget.dataset.purchase;
    if (!purchase || !this.data.service) return;

    const unitPrice = purchase.unit_price || this.data.service.unit_price || this.data.service.base_price;
    const originalPrice = Number(unitPrice) * purchase.count;
    const savedAmount = Math.max(originalPrice - purchase.price, 0);

    this.setData({
      selectedPurchase: purchase,
      totalPrice: Number(purchase.price).toFixed(2),
      savedAmount: savedAmount.toFixed(0),
      selectedCoupon: null,
      discountAmount: 0
    });
    this.loadCheckoutCoupons(Number(purchase.price));
  },

  loadCheckoutCoupons(amount) {
    app.request({
      url: '/orders/checkout-coupons',
      data: { amount }
    }).then((res) => {
      if (res.code === 0) {
        this.setData({ checkoutCoupons: res.data || [] });
      }
    }).catch(() => {});
  },

  selectCoupon(e) {
    const coupon = e.currentTarget.dataset.coupon;
    if (!coupon || !coupon.usable) {
      wx.showToast({ title: '该优惠券不可用', icon: 'none' });
      return;
    }
    const base = parseFloat(this.data.totalPrice);
    let discount = 0;
    let finalPrice = base;
    if (coupon.type_name === '折扣券') {
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

  clearCoupon() {
    const base = this.data.selectedPurchase ? Number(this.data.selectedPurchase.price) : parseFloat(this.data.servicePrice);
    this.setData({
      selectedCoupon: null,
      discountAmount: 0,
      totalPrice: base.toFixed(2)
    });
  },

  onDateChange(e) {
    const index = Number(e.detail.value);
    const dateItem = this.data.availableDates[index];
    if (!dateItem) return;

    this.setData({
      dateIndex: index,
      selectedDate: dateItem.date,
      selectedDateLabel: dateItem.label,
      selectedTimeDisplay: this.buildTimeDisplay(
        dateItem.date,
        this.data.selectedTimeSlot?.name || ''
      )
    });
  },

  onSlotChange(e) {
    const index = Number(e.detail.value);
    const slot = this.data.timeSlots[index];
    if (!slot) return;

    this.setData({
      slotIndex: index,
      selectedTimeSlot: slot,
      selectedTimeDisplay: this.buildTimeDisplay(this.data.selectedDate, slot.name)
    });
  },

  createOrder() {
    const { service, selectedDate, selectedTimeSlot, selectedPurchase, selectedCoupon } = this.data;

    if (!service?.publisher?.id) {
      wx.showToast({ title: '服务人员信息缺失', icon: 'none' });
      return;
    }
    if (!selectedDate) {
      wx.showToast({ title: '请选择服务日期', icon: 'none' });
      return;
    }
    if (!selectedTimeSlot) {
      wx.showToast({ title: '请选择服务时段', icon: 'none' });
      return;
    }
    if (!selectedPurchase) {
      wx.showToast({ title: '请选择购买方式', icon: 'none' });
      return;
    }

    app.request({
      url: '/orders',
      method: 'POST',
      data: {
        service_id: service.id,
        package_id: selectedPurchase.package_id || null,
        service_count: selectedPurchase.count,
        scheduled_date: selectedDate,
        scheduled_time: selectedTimeSlot.start,
        assign_type: 1,
        provider_id: service.publisher.id,
        total_amount: parseFloat(this.data.totalPrice),
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

  goToProviderDetail: function () {
    const publisher = this.data.service && this.data.service.publisher;
    if (!publisher || !publisher.id) return;
    wx.navigateTo({
      url: `/pages/provider-detail/provider-detail?id=${publisher.id}`
    });
  }
});
