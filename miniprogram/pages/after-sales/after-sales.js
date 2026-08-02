const app = getApp();

Page({
  data: {
    orderId: null,
    type: 'refund',
    reason: '',
    images: [],
    typeOptions: [
      { value: 'refund', label: '退款申请' },
      { value: 'end_early', label: '提前结束服务' },
      { value: 'dispute', label: '服务纠纷' }
    ],
    uploading: false
  },

  onLoad: function (options) {
    if (options.order_id) {
      this.setData({ orderId: options.order_id });
    }
  },

  onTypeChange: function (e) {
    const index = Number(e.detail.value);
    this.setData({ type: this.data.typeOptions[index].value });
  },

  onReasonInput: function (e) {
    this.setData({ reason: e.detail.value });
  },

  chooseImage: function () {
    if (this.data.images.length >= 3) {
      wx.showToast({ title: '最多上传3张图片', icon: 'none' });
      return;
    }
    wx.chooseImage({
      count: 3 - this.data.images.length,
      sizeType: ['compressed'],
      success: (res) => {
        this.uploadImages(res.tempFilePaths);
      }
    });
  },

  uploadImages: function (paths) {
    this.setData({ uploading: true });
    const uploads = paths.map((path) => this.uploadOne(path));
    Promise.all(uploads).then((urls) => {
      this.setData({
        images: [...this.data.images, ...urls.filter(Boolean)],
        uploading: false
      });
    }).catch(() => {
      this.setData({ uploading: false });
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    });
  },

  uploadOne: function (filePath) {
    const token = app.getSession('user').token;
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${app.globalData.apiBase}/upload/image`,
        filePath,
        name: 'file',
        header: { Authorization: `Bearer ${token}` },
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            resolve(data.code === 0 ? data.data.url : null);
          } catch (_) {
            reject();
          }
        },
        fail: reject
      });
    });
  },

  removeImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.images];
    images.splice(index, 1);
    this.setData({ images });
  },

  submit: function () {
    const { orderId, type, reason, images } = this.data;
    if (!orderId) {
      wx.showToast({ title: '缺少订单信息', icon: 'none' });
      return;
    }
    if (!reason.trim()) {
      wx.showToast({ title: '请填写售后原因', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });
    app.request({
      url: '/orders/after-sales',
      method: 'POST',
      data: { order_id: orderId, type, reason: reason.trim(), images }
    }).then((res) => {
      wx.hideLoading();
      if (res.code === 0) {
        wx.showToast({ title: '申请已提交', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '提交失败', icon: 'none' });
    });
  }
});
