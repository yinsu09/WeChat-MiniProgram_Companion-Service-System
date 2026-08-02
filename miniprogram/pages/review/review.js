const app = getApp();

Page({
  data: {
    order: null,
    orderId: null,
    isReviewed: false,
    showHistory: false,
    isLoading: true,
    starArray: [1, 2, 3, 4, 5],
    providerRating: {
      professional: 0,
      attitude: 0,
      punctual: 0
    },
    overallRating: 0,
    reviewText: '',
    reviewImages: [],
    isAnonymous: true,
    ratingLabels: ['很差', '较差', '一般', '满意', '非常满意'],
    historyReviews: [],
    providerStats: {
      avgRating: '0.0',
      totalReviews: 0,
      goodRate: 0
    }
  },

  onLoad: function (options) {
    const orderId = options.order_id;
    this.setData({ isLoading: true });

    if (orderId) {
      this.setData({ orderId });
      this.loadOrder(orderId);
    } else {
      this.setData({ isLoading: false });
      wx.showToast({ title: '缺少订单信息', icon: 'none' });
    }

    if (options.show_history) {
      this.setData({ showHistory: true });
    }
  },

  loadOrder: function (orderId) {
    app.request({
      url: `/orders/${orderId}`
    }).then(res => {
      this.setData({ isLoading: false });
      if (res.code === 0 && res.data) {
        this.setData({ order: res.data });
        if (this.data.showHistory && res.data.provider_id) {
          this.loadProviderHistory(res.data.provider_id);
        }
      } else {
        wx.showToast({ title: res.message || '加载订单失败', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ isLoading: false });
      wx.showToast({ title: '加载订单失败', icon: 'none' });
    });
  },

  tapStarHalf: function (e) {
    const type = e.currentTarget.dataset.type;
    const star = parseInt(e.currentTarget.dataset.star);
    const side = e.currentTarget.dataset.side;
    const currentRating = this.data.providerRating[type];

    let newRating = 0;

    if (side === 'left') {
      newRating = star - 0.5;
    } else {
      newRating = star;
    }

    const providerRating = { ...this.data.providerRating };
    providerRating[type] = newRating;
    this.setData({ providerRating });
    this.calculateOverallRating();
  },

  tapOverallHalf: function (e) {
    const star = parseInt(e.currentTarget.dataset.star);
    const side = e.currentTarget.dataset.side;
    const currentRating = this.data.overallRating;

    let newRating = 0;

    if (side === 'left') {
      newRating = star - 0.5;
    } else {
      newRating = star;
    }

    this.setData({ overallRating: newRating });
  },

  getStarLeftClass: function (currentRating, star) {
    if (currentRating >= star) {
      return 'full';
    } else if (currentRating >= star - 0.5) {
      return 'half';
    }
    return 'empty';
  },

  getStarRightClass: function (currentRating, star) {
    if (currentRating >= star) {
      return 'full';
    }
    return 'empty';
  },

  getOverallLeftClass: function (currentRating, star) {
    return this.getStarLeftClass(currentRating, star);
  },

  getOverallRightClass: function (currentRating, star) {
    return this.getStarRightClass(currentRating, star);
  },

  calculateOverallRating: function () {
    const { professional, attitude, punctual } = this.data.providerRating;
    if (professional === 0 || attitude === 0 || punctual === 0) {
      return;
    }
    const overall = Math.round((professional + attitude + punctual) / 3 * 2) / 2;
    this.setData({ overallRating: overall > 0 ? overall : 0 });
  },

  onReviewTextChange: function (e) {
    this.setData({ reviewText: e.detail.value });
  },

  chooseImage: function () {
    if (this.data.reviewImages.length >= 3) {
      wx.showToast({ title: '最多上传3张图片', icon: 'none' });
      return;
    }

    wx.chooseImage({
      count: 3 - this.data.reviewImages.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePaths = res.tempFilePaths;
        this.setData({
          reviewImages: this.data.reviewImages.concat(tempFilePaths)
        });
      }
    });
  },

  removeImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.reviewImages;
    images.splice(index, 1);
    this.setData({ reviewImages: images });
  },

  toggleAnonymous: function (e) {
    this.setData({ isAnonymous: e.detail.value });
  },

  submitReview: function () {
    const { order, overallRating, providerRating } = this.data;

    if (overallRating === 0) {
      wx.showToast({ title: '请选择综合评分', icon: 'none' });
      return;
    }
    if (providerRating.professional === 0 || providerRating.attitude === 0 || providerRating.punctual === 0) {
      wx.showToast({ title: '请完成所有维度的评分', icon: 'none' });
      return;
    }

    const userSession = app.getUserSession();
    const reviewData = {
      order_id: order.id,
      provider_id: order.provider_id,
      service_id: order.service_id,
      user_id: (userSession.userInfo && userSession.userInfo.id) || 1,
      overall_rating: overallRating,
      professional_rating: providerRating.professional,
      attitude_rating: providerRating.attitude,
      punctual_rating: providerRating.punctual,
      content: this.data.reviewText,
      images: this.data.reviewImages,
      is_anonymous: this.data.isAnonymous
    };

    app.request({
      url: '/reviews',
      method: 'POST',
      data: reviewData
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '评价成功', icon: 'success' });
        this.setData({ isReviewed: true });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.message || '评价失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '提交失败', icon: 'none' });
    });
  },

  loadProviderHistory: function (providerId) {
    const pid = providerId || (this.data.order && this.data.order.provider_id);
    if (!pid) return;

    app.request({ url: `/reviews/provider/${pid}` }).then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({
          historyReviews: res.data.reviews || [],
          providerStats: res.data.stats || { avgRating: '0.0', totalReviews: 0, goodRate: 0 }
        });
      } else {
        this.setData({
          historyReviews: [],
          providerStats: { avgRating: '0.0', totalReviews: 0, goodRate: 0 }
        });
      }
    }).catch(() => {
      this.setData({
        historyReviews: [],
        providerStats: { avgRating: '0.0', totalReviews: 0, goodRate: 0 }
      });
    });
  }
});