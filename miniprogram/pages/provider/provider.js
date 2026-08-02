const app = getApp();

Page({
  data: {
    formData: {
      phone: '',
      realName: '',
      idCard: '',
      services: []
    },
    serviceOptions: [
      { id: 1, name: '陪诊' },
      { id: 2, name: '陪护' },
      { id: 3, name: '陪玩' },
      { id: 4, name: '陪吃' },
      { id: 5, name: '陪游' },
      { id: 6, name: '陪学' }
    ]
  },

  submitForm: function () {
    const { phone, realName, idCard, services } = this.data.formData;
    if (!phone || !realName || !idCard) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    if (services.length === 0) {
      wx.showToast({ title: '请选择服务类型', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '申请成功',
      content: '您的申请已提交，请等待审核',
      showCancel: false,
      success: () => {
        wx.navigateBack();
      }
    });
  },

  toggleService: function (e) {
    const serviceId = e.currentTarget.dataset.serviceId;
    const services = [...this.data.formData.services];
    const index = services.indexOf(serviceId);
    if (index > -1) {
      services.splice(index, 1);
    } else {
      services.push(serviceId);
    }
    this.setData({ 'formData.services': services });
  }
});
