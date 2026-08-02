const app = getApp();

function saveLoginSession(token, user) {
  app.setSessionByUserRole(token, user);
}

Page({
  data: {
    phone: '',
    code: '',
    role: 1,
    codeBtnText: '获取验证码',
    codeTimer: 0
  },

  onLoad: function () {
    this.checkAutoLogin();
  },

  checkAutoLogin: function () {
    ['user', 'provider', 'admin'].some((role) => {
      const session = app.getSession(role);
      if (session.token && session.userInfo) {
        app.switchRole(role);
        this.redirectToHome(session.userInfo.role);
        return true;
      }
      return false;
    });
  },

  onPhoneInput: function (e) {
    this.setData({ phone: e.detail.value });
  },

  onCodeInput: function (e) {
    this.setData({ code: e.detail.value });
  },

  selectRole: function (e) {
    const role = parseInt(e.currentTarget.dataset.role);
    this.setData({ role });
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

  handleLogin: function () {
    const { phone, code, role } = this.data;
    
    if (!phone || phone.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    
    if (!code) {
      wx.showToast({ title: '请输入验证码', icon: 'none' });
      return;
    }

    app.request({
      url: '/user/login-by-phone',
      method: 'POST',
      data: { phone, code, role }
    }).then(res => {
      if (res.code === 0) {
        const { token, user } = res.data;
        saveLoginSession(token, user);
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          this.redirectToHome(user.role);
        }, 1500);
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    }).catch(() => {
      wx.showToast({ title: '登录失败', icon: 'none' });
    });
  },

  wechatLogin: function () {
    wx.login({
      success: (loginRes) => {
        wx.getUserProfile({
          desc: '用于完善会员资料',
          success: (profileRes) => {
            app.request({
              url: '/user/login',
              method: 'POST',
              data: { 
                code: loginRes.code,
                nickname: profileRes.userInfo.nickName,
                avatar_url: profileRes.userInfo.avatarUrl,
                role: this.data.role
              }
            }).then(res => {
              if (res.code === 0) {
                const { token, user } = res.data;
                saveLoginSession(token, user);
                wx.showToast({ title: '登录成功', icon: 'success' });
                setTimeout(() => {
                  this.redirectToHome(user.role);
                }, 1500);
              } else {
                wx.showToast({ title: res.message, icon: 'none' });
              }
            }).catch(() => {
              wx.showToast({ title: '登录失败', icon: 'none' });
            });
          },
          fail: () => {
            wx.showToast({ title: '请授权登录', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  },

  goToRegister: function () {
    wx.navigateTo({ url: '/pages/register/register' });
  },

  redirectToHome: function (role) {
    if (role === 1) {
      wx.switchTab({ url: '/pages/index/index' });
    } else if (role === 2) {
      wx.redirectTo({ url: '/pages/login-provider/login-provider' });
    } else if (role === 3) {
      wx.navigateTo({ url: '/pages/admin/admin' });
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  }
});
