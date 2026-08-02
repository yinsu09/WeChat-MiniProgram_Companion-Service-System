const fs = require('fs');
const path = require('path');

global.wx = {
  _data: {},
  getStorageSync(key) {
    return this._data[key] ?? '';
  },
  setStorageSync(key, value) {
    this._data[key] = value;
  },
  removeStorageSync(key) {
    delete this._data[key];
  }
};

const auth = require('../../miniprogram/utils/auth');
const LOG = path.join(__dirname, '../debug-5c0501.log');

function log(message, data) {
  fs.appendFileSync(LOG, `${JSON.stringify({
    sessionId: '5c0501',
    hypothesisId: 'AUTH',
    location: 'authRoleTest.js',
    message,
    data,
    timestamp: Date.now(),
    runId: 'auth-verify'
  })}\n`);
}

auth.setSession('user', 'user-token-111', { id: 1, role: 1, nickname: '用户A', points: 100 });
auth.setSession('admin', 'admin-token-222', { id: 99, role: 3, nickname: '管理员' });
auth.setSession('provider', 'provider-token-333', { id: 2, role: 2, nickname: '服务人员B' });

auth.switchRole('admin');
const afterAdminSwitch = {
  activeRole: auth.getActiveRole(),
  legacyToken: wx.getStorageSync('token'),
  adminTokenOnAdminApi: auth.getToken('admin', '/admin/stats'),
  userTokenOnUserApi: auth.getToken('user', '/user/profile-stats')
};

auth.switchRole('user');
auth.updateSessionUserInfo('user', { points: 250 });
const afterPointsUpdate = auth.getSession('user').userInfo.points;

auth.clearSession('user');
const afterUserLogout = {
  userToken: auth.getSession('user').token,
  adminToken: auth.getSession('admin').token,
  providerToken: auth.getSession('provider').token
};

log('role sessions isolated', { afterAdminSwitch, afterPointsUpdate, afterUserLogout });

const pass = afterAdminSwitch.adminTokenOnAdminApi === 'admin-token-222'
  && afterAdminSwitch.userTokenOnUserApi === 'user-token-111'
  && afterPointsUpdate === 250
  && afterUserLogout.userToken === ''
  && afterUserLogout.adminToken === 'admin-token-222';

console.log(pass ? 'AUTH TEST PASSED' : 'AUTH TEST FAILED');
process.exit(pass ? 0 : 1);
