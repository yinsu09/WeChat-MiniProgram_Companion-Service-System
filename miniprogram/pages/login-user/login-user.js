const app = getApp();

Page({
  data: {
    loginType: 'password',
    phone: '',
    password: '',
    code: '',
    codeBtnText: '获取验证码',
    codeTimer: 0
  },

  onLoad: function () {
    this.checkAutoLogin();
  },

  checkAutoLogin: function () {
    const session = app.getUserSession();
    if (session.token && session.userInfo && Number(session.userInfo.role) === 1) {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  switchLoginType: function (e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ loginType: type, code: '', password: '' });
  },

  onPhoneInput: function (e) {
    this.setData({ phone: e.detail.value });
  },

  onPasswordInput: function (e) {
    this.setData({ password: e.detail.value });
  },

  onCodeInput: function (e) {
    this.setData({ code: e.detail.value });
  },

  getCode: function () {
    const phone = this.data.phone;
    if (!phone || phone.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (this.data.codeTimer > 0) return;

    app.request({
      url: '/user/send-code',
      method: 'POST',
      data: { phone }
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '验证码已发送', icon: 'success' });
        this.startCodeTimer();
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '发送失败', icon: 'none' });
    });
  },

  startCodeTimer: function () {
    this.setData({ codeBtnText: '60秒后重发', codeTimer: 60 });
    const timer = setInterval(() => {
      const newTimer = this.data.codeTimer - 1;
      if (newTimer <= 0) {
        clearInterval(timer);
        this.setData({ codeBtnText: '获取验证码', codeTimer: 0 });
      } else {
        this.setData({ codeBtnText: `${newTimer}秒后重发`, codeTimer: newTimer });
      }
    }, 1000);
  },

  handleLogin: function () {
    const { phone, password, code, loginType } = this.data;
    
    if (!phone || phone.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    if (loginType === 'password') {
      if (!password) {
        wx.showToast({ title: '请输入密码', icon: 'none' });
        return;
      }
      this.loginByPassword(phone, password);
    } else {
      if (!code) {
        wx.showToast({ title: '请输入验证码', icon: 'none' });
        return;
      }
      this.loginByCode(phone, code);
    }
  },

  loginByPassword: function (phone, password) {
    app.request({
      url: '/user/login-by-password',
      method: 'POST',
      data: { phone, password, role: 1 }
    }).then(res => {
      if (res.code === 0) {
        this.handleLoginSuccess(res.data);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '登录失败', icon: 'none' });
    });
  },

  loginByCode: function (phone, code) {
    app.request({
      url: '/user/login-by-phone',
      method: 'POST',
      data: { phone, code, role: 1 }
    }).then(res => {
      if (res.code === 0) {
        this.handleLoginSuccess(res.data);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '登录失败', icon: 'none' });
    });
  },

  wechatLogin: function () {
    wx.showLoading({ title: '登录中...' });
    
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          wx.hideLoading();
          wx.showToast({ title: '登录失败', icon: 'none' });
          return;
        }

        wx.getUserProfile({
          desc: '用于完善会员资料',
          success: (profileRes) => {
            this.completeWechatLogin(loginRes.code, profileRes.userInfo);
          },
          fail: (err) => {
            wx.hideLoading();
            if (err.errMsg.includes('auth deny')) {
              wx.showToast({ title: '请授权登录', icon: 'none' });
            } else {
              this.wechatLoginFallback(loginRes.code);
            }
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  },

  completeWechatLogin: function (code, userInfo) {
    app.request({
      url: '/user/wechat-login',
      method: 'POST',
      data: { 
        code,
        nickname: userInfo.nickName,
        avatar_url: userInfo.avatarUrl,
        gender: userInfo.gender,
        role: 1
      }
    }).then(res => {
      wx.hideLoading();
      if (res.code === 0) {
        this.handleLoginSuccess(res.data);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '登录失败', icon: 'none' });
    });
  },

  wechatLoginFallback: function (code) {
    app.request({
      url: '/user/wechat-login',
      method: 'POST',
      data: { 
        code,
        role: 1
      }
    }).then(res => {
      wx.hideLoading();
      if (res.code === 0) {
        this.handleLoginSuccess(res.data);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '登录失败', icon: 'none' });
    });
  },

  handleLoginSuccess: function (data) {
    const { token, user } = data;
    app.setSession('user', token, user);
    wx.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' });
    }, 1500);
  },

  goToRegister: function () {
    wx.navigateTo({ url: '/pages/register-user/register-user' });
  },

  goToForgot: function () {
    wx.navigateTo({ url: '/pages/forgot-password/forgot-password' });
  },

  goToProviderLogin: function () {
    wx.redirectTo({ url: '/pages/login-provider/login-provider' });
  },

  goToAdminLogin: function () {
    wx.redirectTo({ url: '/pages/login-admin/login-admin' });
  }
});
