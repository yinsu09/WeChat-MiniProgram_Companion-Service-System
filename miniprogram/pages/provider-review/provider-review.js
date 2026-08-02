const app = getApp();

Page({
  data: {
    orderId: null,
    orderInfo: null,
    starArray: [1, 2, 3, 4, 5],
    attitudeRating: 0,
    cooperationRating: 0,
    communicationRating: 0,
    comment: '',
    canSubmit: false,
    behaviorTags: [
      { id: 1, name: '准时到达', type: 'positive', selected: false },
      { id: 2, name: '配合良好', type: 'positive', selected: false },
      { id: 3, name: '沟通顺畅', type: 'positive', selected: false },
      { id: 4, name: '态度友好', type: 'positive', selected: false },
      { id: 5, name: '需求明确', type: 'positive', selected: false },
      { id: 6, name: '迟到', type: 'negative', selected: false },
      { id: 7, name: '临时取消', type: 'negative', selected: false },
      { id: 8, name: '沟通困难', type: 'negative', selected: false },
      { id: 9, name: '要求过多', type: 'negative', selected: false },
      { id: 10, name: '爽约', type: 'negative', selected: false }
    ]
  },

  onLoad: function (options) {
    this.setData({ orderId: options.order_id });
    this.loadOrderInfo();
  },

  loadOrderInfo: function () {
    const orderId = this.data.orderId;
    app.request({
      url: '/provider/order/detail',
      data: { order_id: orderId }
    }).then(res => {
      if (res.code === 0 && res.data) {
        this.setData({ orderInfo: res.data });
      } else {
        wx.showToast({ title: res.message || '加载订单失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '加载订单失败', icon: 'none' });
    });
  },

  getAttitudeLeftClass: function (star) {
    const rating = this.data.attitudeRating;
    if (rating >= star) return 'full';
    if (rating >= star - 0.5) return 'half';
    return 'gray';
  },

  getAttitudeRightClass: function (star) {
    const rating = this.data.attitudeRating;
    if (rating >= star) return 'full';
    if (rating >= star - 0.5) return 'half';
    return 'gray';
  },

  getCooperationLeftClass: function (star) {
    const rating = this.data.cooperationRating;
    if (rating >= star) return 'full';
    if (rating >= star - 0.5) return 'half';
    return 'gray';
  },

  getCooperationRightClass: function (star) {
    const rating = this.data.cooperationRating;
    if (rating >= star) return 'full';
    if (rating >= star - 0.5) return 'half';
    return 'gray';
  },

  getCommunicationLeftClass: function (star) {
    const rating = this.data.communicationRating;
    if (rating >= star) return 'full';
    if (rating >= star - 0.5) return 'half';
    return 'gray';
  },

  getCommunicationRightClass: function (star) {
    const rating = this.data.communicationRating;
    if (rating >= star) return 'full';
    if (rating >= star - 0.5) return 'half';
    return 'gray';
  },

  tapAttitudeStar: function (e) {
    const star = e.currentTarget.dataset.star;
    const side = e.currentTarget.dataset.side;
    let newRating;
    if (side === 'left') {
      newRating = star - 0.5;
    } else {
      newRating = star;
    }
    this.setData({ attitudeRating: newRating });
    this.updateCanSubmit();
    this.setData({});
  },

  tapCooperationStar: function (e) {
    const star = e.currentTarget.dataset.star;
    const side = e.currentTarget.dataset.side;
    let newRating;
    if (side === 'left') {
      newRating = star - 0.5;
    } else {
      newRating = star;
    }
    this.setData({ cooperationRating: newRating });
    this.updateCanSubmit();
    this.setData({});
  },

  tapCommunicationStar: function (e) {
    const star = e.currentTarget.dataset.star;
    const side = e.currentTarget.dataset.side;
    let newRating;
    if (side === 'left') {
      newRating = star - 0.5;
    } else {
      newRating = star;
    }
    this.setData({ communicationRating: newRating });
    this.updateCanSubmit();
    this.setData({});
  },

  updateCanSubmit: function () {
    const { attitudeRating, cooperationRating, communicationRating } = this.data;
    this.setData({
      canSubmit: attitudeRating > 0 && cooperationRating > 0 && communicationRating > 0
    });
  },

  toggleTag: function (e) {
    const tagId = e.currentTarget.dataset.id;
    const behaviorTags = this.data.behaviorTags.map(tag => {
      if (tag.id === tagId) {
        return { ...tag, selected: !tag.selected };
      }
      return tag;
    });
    this.setData({ behaviorTags });
  },

  onCommentChange: function (e) {
    this.setData({ comment: e.detail.value });
  },

  submitReview: function () {
    const { attitudeRating, cooperationRating, communicationRating, comment, orderId, behaviorTags } = this.data;

    if (attitudeRating === 0 || cooperationRating === 0 || communicationRating === 0) {
      wx.showToast({ title: '请完成全部评分', icon: 'none' });
      return;
    }

    const selectedTags = behaviorTags.filter(tag => tag.selected).map(tag => tag.id);

    const reviewData = {
      order_id: orderId,
      attitude_rating: attitudeRating,
      cooperation_rating: cooperationRating,
      communication_rating: communicationRating,
      content: comment,
      behavior_tags: selectedTags
    };

    app.request({
      url: '/provider/review/user',
      method: 'POST',
      data: reviewData
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '评价提交成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '提交失败', icon: 'none' });
    });
  }
});