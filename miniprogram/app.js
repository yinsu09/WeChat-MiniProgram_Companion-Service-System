const auth = require('./utils/auth');

App({
  globalData: {
    userInfo: null,
    token: null,
    providerInfo: null,
    activeRole: '',
    baseUrl: 'http://127.0.0.1:3001/api'
  },

  onLaunch: function () {
    auth.migrateLegacyStorage();
    this.restoreActiveSession();
  },

  restoreActiveSession: function () {
    const role = auth.getActiveRole();
    const session = auth.getSession(role).token ? auth.switchRole(role) : null;
    if (session) {
      auth.applySessionToGlobal(this.globalData, role, session);
    }
  },

  setSession: function (role, token, userInfo) {
    auth.setSession(role, token, userInfo);
    auth.applySessionToGlobal(this.globalData, role, { token, userInfo });
  },

  setSessionByUserRole: function (token, userInfo) {
    const roleNum = Number(userInfo && userInfo.role);
    const role = roleNum === 3 ? 'admin' : roleNum === 2 ? 'provider' : 'user';
    this.setSession(role, token, userInfo);
    return role;
  },

  switchRole: function (role) {
    const session = auth.switchRole(role);
    if (session) {
      auth.applySessionToGlobal(this.globalData, role, session);
      return true;
    }
    return false;
  },

  clearSession: function (role) {
    auth.clearSession(role);
    auth.clearGlobalForRole(this.globalData, role);
  },

  updateUserPoints: function (points) {
    const value = Number(points) || 0;
    const userInfo = auth.updateSessionUserInfo('user', { points: value });
    if (!userInfo) return;
    if (this.globalData.activeRole === 'user') {
      this.globalData.userInfo = userInfo;
    }
  },

  updateUserInfo: function (partial) {
    const userInfo = auth.updateSessionUserInfo('user', partial);
    if (!userInfo) return null;
    if (this.globalData.activeRole === 'user') {
      this.globalData.userInfo = userInfo;
    }
    return userInfo;
  },

  updateProviderInfo: function (partial) {
    const session = auth.getSession('provider');
    if (!session.token) return null;
    const userInfo = { ...(session.userInfo || {}), ...partial };
    auth.setSession('provider', session.token, userInfo);
    if (this.globalData.activeRole === 'provider') {
      this.globalData.providerInfo = userInfo;
      this.globalData.userInfo = userInfo;
    }
    return userInfo;
  },

  getUserSession: function () {
    return auth.getSession('user');
  },

  getSession: function (role) {
    return auth.getSession(role);
  },

  checkLogin: function () {
    this.restoreActiveSession();
  },

  login: function (callback) {
    wx.login({
      success: (res) => {
        wx.request({
          url: `${this.globalData.baseUrl}/user/login`,
          method: 'POST',
          data: { code: res.code },
          success: (result) => {
            if (result.data.code === 0) {
              const { token, user } = result.data.data;
              this.setSession('user', token, user);
              callback && callback(result.data.data);
            }
          }
        });
      }
    });
  },

  request: function (options) {
    const authRole = options.authRole
      || auth.inferRoleFromUrl(options.url)
      || this.globalData.activeRole
      || auth.getActiveRole()
      || 'user';
    const requestOptions = { ...options };
    delete requestOptions.authRole;

    const token = auth.getToken(authRole, options.url, this.globalData.activeRole);
    if (token) {
      this.globalData.token = token;
      requestOptions.header = requestOptions.header || {};
      requestOptions.header.Authorization = `Bearer ${token}`;
    }
    requestOptions.url = `${this.globalData.baseUrl}${options.url}`;

    return new Promise((resolve, reject) => {
      wx.request({
        ...requestOptions,
        success: (res) => {
          if (res.data.code === 401) {
            if (authRole === 'user') {
              this.login(() => {
                this.request({ ...options, authRole: 'user' }).then(resolve).catch(reject);
              });
            } else {
              reject(new Error('登录已过期，请重新登录'));
            }
          } else {
            resolve(res.data);
          }
        },
        fail: reject
      });
    });
  },

  resolveImageUrl: function (url) {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('wxfile')) return url;
    const base = this.globalData.baseUrl.replace(/\/api$/, '');
    return `${base}${url.startsWith('/') ? url : `/${url}`}`;
  },

  uploadImage: function (tempFilePath, authRole) {
    const app = this;
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: tempFilePath,
        encoding: 'base64',
        success: (res) => {
          app.request({
            url: '/upload/image',
            method: 'POST',
            authRole: authRole || app.globalData.activeRole || 'user',
            data: { base64: res.data }
          }).then((result) => {
            if (result.code === 0 && result.data && result.data.url) {
              resolve(result.data.url);
            } else {
              reject(new Error(result.message || '上传失败'));
            }
          }).catch(reject);
        },
        fail: reject
      });
    });
  }
});
