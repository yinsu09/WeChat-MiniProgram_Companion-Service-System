const app = getApp();

Page({
  data: {
    username: '',
    password: '',
    remember: false
  },

  onLoad: function () {
    this.loadRemembered();
  },

  loadRemembered: function () {
    const remembered = wx.getStorageSync('admin_remember');
    if (remembered) {
      this.setData({ 
        username: remembered.username, 
        password: remembered.password,
        remember: true 
      });
    }
  },

  onUsernameInput: function (e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput: function (e) {
    this.setData({ password: e.detail.value });
  },

  toggleRemember: function () {
    this.setData({ remember: !this.data.remember });
  },

  handleLogin: function () {
    const { username, password, remember } = this.data;
    
    if (!username) {
      wx.showToast({ title: '请输入用户名', icon: 'none' });
      return;
    }
    
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    app.request({
      url: '/admin/login',
      method: 'POST',
      data: { username, password }
    }).then(res => {
      if (res.code === 0) {
        this.handleLoginSuccess(res.data, remember);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '登录失败', icon: 'none' });
    });
  },

  handleLoginSuccess: function (data, remember) {
    const { token, user } = data;
    app.setSession('admin', token, user);
    
    if (remember) {
      wx.setStorageSync('admin_remember', { 
        username: this.data.username, 
        password: this.data.password 
      });
    } else {
      wx.removeStorageSync('admin_remember');
    }
    
    wx.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => {
      wx.redirectTo({ url: '/pages/admin/admin' });
    }, 1500);
  },

  goToUserLogin: function () {
    wx.redirectTo({ url: '/pages/login-user/login-user' });
  },

  goToProviderLogin: function () {
    wx.redirectTo({ url: '/pages/login-provider/login-provider' });
  }
});
