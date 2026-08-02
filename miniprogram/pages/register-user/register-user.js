const app = getApp();

Page({
  data: {
    phone: '',
    code: '',
    password: '',
    confirmPassword: '',
    codeBtnText: '获取验证码',
    codeTimer: 0
  },

  goBack: function () {
    wx.navigateBack();
  },

  onPhoneInput: function (e) {
    this.setData({ phone: e.detail.value });
  },

  onCodeInput: function (e) {
    this.setData({ code: e.detail.value });
  },

  onPasswordInput: function (e) {
    this.setData({ password: e.detail.value });
  },

  onConfirmPasswordInput: function (e) {
    this.setData({ confirmPassword: e.detail.value });
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
      const timer = this.data.codeTimer - 1;
      if (timer <= 0) {
        clearInterval(timer);
        this.setData({ codeBtnText: '获取验证码', codeTimer: 0 });
      } else {
        this.setData({ codeBtnText: `${timer}秒后重发`, codeTimer: timer });
      }
    }, 1000);
  },

  handleRegister: function () {
    const { phone, code, password, confirmPassword } = this.data;

    if (!phone || phone.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    if (!code) {
      wx.showToast({ title: '请输入验证码', icon: 'none' });
      return;
    }

    if (!password || password.length < 6) {
      wx.showToast({ title: '密码长度不能少于6位', icon: 'none' });
      return;
    }

    if (password !== confirmPassword) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
      return;
    }

    app.request({
      url: '/user/register',
      method: 'POST',
      data: { phone, code, password, role: 1 }
    }).then(res => {
      if (res.code === 0) {
        wx.showToast({ title: '注册成功', icon: 'success' });
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/login-user/login-user' });
        }, 1500);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '注册失败', icon: 'none' });
    });
  }
});