const STORAGE_KEYS = {
  user: 'auth_session_user',
  provider: 'auth_session_provider',
  admin: 'auth_session_admin'
};

const ACTIVE_ROLE_KEY = 'auth_active_role';
const LEGACY_TOKEN_KEY = 'token';
const LEGACY_USER_KEY = 'userInfo';

function inferRoleFromUserInfo(userInfo) {
  const role = Number(userInfo && userInfo.role);
  if (role === 3) return 'admin';
  if (role === 2) return 'provider';
  return 'user';
}

function inferRoleFromUrl(url) {
  const path = String(url || '').split('?')[0];
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/provider')) return 'provider';
  if (path.startsWith('/user') || path.startsWith('/orders') || path.startsWith('/reviews')) return 'user';
  return '';
}

function getSession(role) {
  const data = wx.getStorageSync(STORAGE_KEYS[role]);
  if (data && data.token) {
    return { token: data.token, userInfo: data.userInfo || null };
  }
  return { token: '', userInfo: null };
}

function syncLegacyKeys(role, token, userInfo) {
  const active = wx.getStorageSync(ACTIVE_ROLE_KEY);
  if (active === role && token) {
    wx.setStorageSync(LEGACY_TOKEN_KEY, token);
    wx.setStorageSync(LEGACY_USER_KEY, userInfo);
  }
}

function setSession(role, token, userInfo) {
  wx.setStorageSync(STORAGE_KEYS[role], { token, userInfo });
  wx.setStorageSync(ACTIVE_ROLE_KEY, role);
  syncLegacyKeys(role, token, userInfo);
}

function switchRole(role) {
  const session = getSession(role);
  if (!session.token) return null;
  wx.setStorageSync(ACTIVE_ROLE_KEY, role);
  syncLegacyKeys(role, session.token, session.userInfo);
  return session;
}

function getActiveRole() {
  return wx.getStorageSync(ACTIVE_ROLE_KEY) || 'user';
}

function getToken(role, url, activeRole) {
  const resolvedRole = role || inferRoleFromUrl(url) || activeRole || getActiveRole() || 'user';
  return getSession(resolvedRole).token || '';
}

function clearSession(role) {
  wx.removeStorageSync(STORAGE_KEYS[role]);
  const active = wx.getStorageSync(ACTIVE_ROLE_KEY);
  if (active === role) {
    wx.removeStorageSync(LEGACY_TOKEN_KEY);
    wx.removeStorageSync(LEGACY_USER_KEY);
    wx.removeStorageSync(ACTIVE_ROLE_KEY);
  }
}

function updateSessionUserInfo(role, partial) {
  const session = getSession(role);
  if (!session.token) return null;
  const userInfo = { ...(session.userInfo || {}), ...partial };
  setSession(role, session.token, userInfo);
  return userInfo;
}

function migrateLegacyStorage() {
  const hasAny = ['user', 'provider', 'admin'].some((role) => getSession(role).token);
  if (hasAny) return;

  const token = wx.getStorageSync(LEGACY_TOKEN_KEY);
  const userInfo = wx.getStorageSync(LEGACY_USER_KEY);
  if (token && userInfo) {
    setSession(inferRoleFromUserInfo(userInfo), token, userInfo);
  }
}

function applySessionToGlobal(globalData, role, session) {
  if (!session) return;
  globalData.token = session.token;
  globalData.userInfo = session.userInfo;
  globalData.activeRole = role;
  if (role === 'provider') {
    globalData.providerInfo = session.userInfo;
  }
}

function clearGlobalForRole(globalData, role) {
  if (globalData.activeRole !== role) return;
  globalData.token = null;
  globalData.userInfo = null;
  if (role === 'provider') {
    globalData.providerInfo = null;
  }
  globalData.activeRole = '';
}

module.exports = {
  STORAGE_KEYS,
  ACTIVE_ROLE_KEY,
  inferRoleFromUserInfo,
  inferRoleFromUrl,
  getSession,
  setSession,
  switchRole,
  getActiveRole,
  getToken,
  clearSession,
  updateSessionUserInfo,
  migrateLegacyStorage,
  applySessionToGlobal,
  clearGlobalForRole
};
