const db = require('./db');
const { getLevelName, getLevelColor, recalculateProviderLevel } = require('./providerLevel');

const TYPE_NAMES = {
  1: '陪诊', 2: '陪护', 3: '陪玩', 4: '陪吃',
  5: '陪游', 6: '陪学', 7: '陪聊'
};

function formatServiceTypes(raw) {
  if (!raw) return '';
  try {
    const ids = JSON.parse(raw);
    if (Array.isArray(ids)) {
      return ids.map(id => TYPE_NAMES[id] || '').filter(Boolean).join(',');
    }
  } catch (_) {
    return raw;
  }
  return raw;
}

async function syncUserToServiceProvider(userId) {
  const users = await db.query('SELECT * FROM users WHERE id = ? AND role = 2', [userId]);
  if (!users.length) return null;

  const user = users[0];
  await db.execute(
    `UPDATE service_providers
     SET nickname = ?, real_name = ?, avatar_url = ?
     WHERE openid = ? OR phone = ?`,
    [
      user.nickname || user.real_name || '服务人员',
      user.real_name || user.nickname || '',
      user.avatar_url || '',
      user.openid,
      user.phone
    ]
  );
  return user;
}

async function buildProviderProfile(userId) {
  const users = await db.query('SELECT * FROM users WHERE id = ? AND role = 2', [userId]);
  if (!users.length) return null;

  const user = users[0];
  await syncUserToServiceProvider(userId);

  const spRows = await db.query(
    'SELECT id FROM service_providers WHERE openid = ? OR phone = ? LIMIT 1',
    [user.openid, user.phone]
  );

  let level = 0;
  let level_name = getLevelName(0);
  let level_color = getLevelColor(0);
  let service_count = 0;
  let rating = '0.0';

  if (spRows.length) {
    const levelInfo = await recalculateProviderLevel(spRows[0].id);
    level = levelInfo.level;
    level_name = levelInfo.level_name;
    level_color = levelInfo.level_color;
    service_count = levelInfo.serviceCount;
    rating = Number(levelInfo.avgRating || 0).toFixed(1);
  }

  const genderText = user.gender === 1 ? '男' : user.gender === 2 ? '女' : '未知';

  return {
    ...user,
    level,
    level_name,
    level_color,
    service_count,
    rating,
    service_types_text: formatServiceTypes(user.service_types),
    gender_text: genderText
  };
}

module.exports = {
  formatServiceTypes,
  syncUserToServiceProvider,
  buildProviderProfile
};
