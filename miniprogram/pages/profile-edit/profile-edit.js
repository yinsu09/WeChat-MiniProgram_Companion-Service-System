const app = getApp();

Page({
  data: {
    nickname: '',
    realName: '',
    phone: '',
    gender: 0,
    bio: '',
    avatarUrl: ''
  },

  onLoad: function () {
    this.loadUserInfo();
  },

  loadUserInfo: function () {
    app.request({ url: '/user/info' }).then((res) => {
      if (res.code === 0 && res.data) {
        const user = res.data;
        this.setData({
          nickname: user.nickname || '',
          realName: user.real_name || '',
          phone: user.phone || '',
          gender: user.gender || 0,
          bio: user.bio || '',
          avatarUrl: app.resolveImageUrl(user.avatar_url)
        });
      }
    }).catch(() => {});
  },

  onNicknameInput: function (e) {
    this.setData({ nickname: e.detail.value });
  },

  onRealNameInput: function (e) {
    this.setData({ realName: e.detail.value });
  },

  onBioInput: function (e) {
    this.setData({ bio: e.detail.value });
  },

  onGenderChange: function (e) {
    this.setData({ gender: parseInt(e.detail.value, 10) });
  },

  changeAvatar: function () {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.showLoading({ title: '上传中' });
        app.uploadImage(tempFilePath).then((url) => {
          wx.hideLoading();
          this.setData({ avatarUrl: app.resolveImageUrl(url) });
        }).catch(() => {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        });
      }
    });
  },

  saveProfile: function () {
    const { nickname, realName, gender, bio, avatarUrl } = this.data;
    if (!nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    app.request({
      url: '/user/info',
      method: 'PUT',
      data: {
        nickname: nickname.trim(),
        real_name: realName.trim(),
        gender,
        bio: bio.trim(),
        avatar_url: avatarUrl
      }
    }).then((res) => {
      if (res.code === 0) {
        const user = res.data || {};
        app.updateUserInfo(user);
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1200);
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  }
});
