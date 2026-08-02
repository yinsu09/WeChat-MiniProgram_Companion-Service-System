const db = require('./db');
const { getLevelName, getLevelColor, recalculateProviderLevel } = require('./providerLevel');

const WEEKDAY_MAP = {
  0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六'
};

const TIME_SLOT_MAP = {
  1: { name: '09:00-12:00', start: '09:00', end: '12:00' },
  2: { name: '12:00-14:00', start: '12:00', end: '14:00' },
  3: { name: '14:00-17:00', start: '14:00', end: '17:00' },
  4: { name: '17:00-20:00', start: '17:00', end: '20:00' }
};

function parseJsonField(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function buildImageList(service) {
  const images = [];
  if (service.cover_image) {
    images.push(service.cover_image);
  }
  parseJsonField(service.images, []).forEach((img) => {
    if (img && !images.includes(img)) {
      images.push(img);
    }
  });
  return images;
}

function parseLevelPrices(service) {
  if (!service?.level_prices) {
    const base = parseFloat(service?.base_price) || 0;
    return [
      { level: 1, level_name: '铜牌', price: base },
      { level: 2, level_name: '银牌', price: base },
      { level: 3, level_name: '金牌', price: base }
    ];
  }
  try {
    const parsed = typeof service.level_prices === 'string'
      ? JSON.parse(service.level_prices)
      : service.level_prices;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function resolveServicePrice(service, providerLevel = 1) {
  const prices = parseLevelPrices(service);
  if (!prices.length) {
    return parseFloat(service?.base_price) || 0;
  }
  const level = Math.max(Number(providerLevel) || 0, 0);
  const tier = level >= 3 ? 3 : (level >= 2 ? 2 : 1);
  const matched = prices.find((item) => Number(item.level) === tier) || prices[tier - 1] || prices[0];
  return parseFloat(matched?.price ?? service.base_price) || 0;
}

async function loadServicePackages(serviceId) {
  return db.query(
    'SELECT * FROM service_packages WHERE service_id = ? AND status = 1 ORDER BY count ASC',
    [serviceId]
  );
}

function buildPurchaseOptions(service, providerLevel = 1) {
  const unitPrice = resolveServicePrice(service, providerLevel);
  const options = [{
    id: 1,
    name: '单次服务',
    count: 1,
    price: Number(unitPrice.toFixed(2)),
    package_id: null,
    discount: 0,
    unit_price: unitPrice
  }];

  const cardType = Number(service.card_type) || 1;
  const cardCount = Number(service.card_count) || 1;
  if (cardType === 2 && cardCount > 1) {
    const fullPrice = Number((unitPrice * cardCount).toFixed(2));
    options.push({
      id: 2,
      name: `${cardCount}次卡`,
      count: cardCount,
      price: fullPrice,
      package_id: null,
      discount: 0,
      unit_price: unitPrice
    });
  }
  return options;
}

async function buildPurchaseOptionsAsync(service, providerLevel = 1) {
  const unitPrice = resolveServicePrice(service, providerLevel);
  const options = [{
    id: 1,
    name: '单次服务',
    count: 1,
    price: Number(unitPrice.toFixed(2)),
    package_id: null,
    discount: 0,
    unit_price: unitPrice
  }];

  const packages = await loadServicePackages(service.id);
  packages.forEach((pkg) => {
    const original = Number((unitPrice * pkg.count).toFixed(2));
    const price = parseFloat(pkg.price) || original;
    options.push({
      id: pkg.id,
      name: pkg.name || `${pkg.count}次卡`,
      count: Number(pkg.count) || 1,
      price: Number(price.toFixed(2)),
      package_id: pkg.id,
      discount: Number(Math.max(original - price, 0).toFixed(2)),
      unit_price: unitPrice
    });
  });

  if (packages.length === 0) {
    const cardType = Number(service.card_type) || 1;
    const cardCount = Number(service.card_count) || 1;
    if (cardType === 2 && cardCount > 1) {
      const fullPrice = Number((unitPrice * cardCount).toFixed(2));
      options.push({
        id: 2,
        name: `${cardCount}次卡`,
        count: cardCount,
        price: fullPrice,
        package_id: null,
        discount: 0,
        unit_price: unitPrice
      });
    }
  }

  return options;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildScheduleInfo(service) {
  const weekdayIds = parseJsonField(service.weekdays, [1, 2, 3, 4, 5]);
  const slotIds = parseJsonField(service.time_slots, [1, 3]);

  const weekdays = weekdayIds.map((id) => ({
    id,
    name: WEEKDAY_MAP[id] || `周${id}`
  }));

  const time_slots = slotIds.map((id) => ({
    id,
    ...(TIME_SLOT_MAP[id] || { name: `时段${id}`, start: '09:00', end: '12:00' })
  }));

  const available_dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 21; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow = d.getDay();
    if (weekdayIds.includes(dow)) {
      const dateStr = formatDate(d);
      available_dates.push({
        date: dateStr,
        weekday: dow,
        label: `${dateStr} ${WEEKDAY_MAP[dow]}`
      });
    }
  }

  return {
    weekdays,
    time_slots,
    available_dates,
    weekday_text: weekdays.map((w) => w.name).join('、'),
    time_slot_text: time_slots.map((t) => t.name).join('、')
  };
}

async function resolveServicePublisher(service) {
  if (!service?.provider_id) return null;

  let rows = await db.query('SELECT * FROM service_providers WHERE id = ?', [service.provider_id]);
  if (!rows.length) {
    rows = await db.query(
      `SELECT sp.* FROM service_providers sp
       INNER JOIN users u ON u.role = 2 AND u.id = ?
         AND (u.openid = sp.openid OR u.phone = sp.phone)
       LIMIT 1`,
      [service.provider_id]
    );
  }
  if (!rows.length) return null;

  const levelInfo = await recalculateProviderLevel(rows[0].id);
  const p = rows[0];
  return {
    id: p.id,
    name: p.nickname || p.real_name || '服务人员',
    avatar_url: p.avatar_url || '',
    phone: p.phone || '',
    level: levelInfo.level,
    level_name: levelInfo.level_name,
    level_color: levelInfo.level_color,
    rating: parseFloat(levelInfo.avgRating ?? p.avg_rating ?? 0).toFixed(1),
    service_count: levelInfo.serviceCount ?? p.total_services ?? 0
  };
}

function formatServiceDetail(service, providerLevel = 1) {
  if (!service) return null;
  const schedule = buildScheduleInfo(service);
  const levelPrices = parseLevelPrices(service);
  const unitPrice = resolveServicePrice(service, providerLevel);
  return {
    ...service,
    card_type: Number(service.card_type) || 1,
    card_count: Number(service.card_count) || 1,
    card_type_text: Number(service.card_type) === 2 ? '多次卡' : '单次卡',
    level_prices: levelPrices,
    unit_price: unitPrice,
    image_list: buildImageList(service),
    purchase_options: buildPurchaseOptions(service, providerLevel),
    content_list: parseJsonField(service.features, []),
    features_list: parseJsonField(service.features, []),
    service_area: service.service_area || '',
    ...schedule
  };
}

async function formatServiceDetailAsync(service) {
  if (!service) return null;
  const publisher = await resolveServicePublisher(service);
  const providerLevel = publisher?.level ?? 1;
  const schedule = buildScheduleInfo(service);
  const levelPrices = parseLevelPrices(service);
  const unitPrice = resolveServicePrice(service, providerLevel);
  const purchaseOptions = await buildPurchaseOptionsAsync(service, providerLevel);
  return {
    ...service,
    card_type: Number(service.card_type) || 1,
    card_count: Number(service.card_count) || 1,
    card_type_text: Number(service.card_type) === 2 ? '多次卡' : '单次卡',
    level_prices: levelPrices,
    unit_price: unitPrice,
    image_list: buildImageList(service),
    purchase_options: purchaseOptions,
    content_list: parseJsonField(service.features, []),
    features_list: parseJsonField(service.features, []),
    service_area: service.service_area || '',
    publisher,
    ...schedule
  };
}

async function getProvidersByTypeId(typeId) {
  const rows = await db.query(
    `SELECT sp.id, sp.nickname AS name, sp.avatar_url, sp.level,
            sp.avg_rating AS rating, sp.total_services AS services,
            sp.available, sp.status, u.service_area, u.service_types
     FROM service_providers sp
     INNER JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
     WHERE sp.status = 1 AND u.status = 1
       AND JSON_CONTAINS(u.service_types, ?)
     ORDER BY sp.avg_rating DESC, sp.total_services DESC`,
    [JSON.stringify(parseInt(typeId, 10))]
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name || '服务人员',
    nickname: row.name || '服务人员',
    avatar_url: row.avatar_url || '',
    level: row.level || 0,
    level_name: getLevelName(row.level || 0),
    level_color: getLevelColor(row.level || 0),
    rating: parseFloat(row.rating || 0).toFixed(1),
    services: row.services || 0,
    service_area: row.service_area || '',
    available: row.available === 1 && row.status === 1
  }));
}

async function getServiceProviderIdByUserId(userId) {
  const users = await db.query('SELECT openid, phone FROM users WHERE id = ? AND role = 2', [userId]);
  if (!users.length) {
    throw new Error('服务人员不存在');
  }
  const { openid, phone } = users[0];
  const providers = await db.query(
    'SELECT id FROM service_providers WHERE openid = ? OR phone = ? LIMIT 1',
    [openid, phone]
  );
  if (!providers.length) {
    throw new Error('服务人员档案不存在');
  }
  return providers[0].id;
}

async function deleteServicesByProvider(spId, userId, phone = '') {
  const providerIds = new Set();
  if (spId) providerIds.add(Number(spId));
  if (userId) providerIds.add(Number(userId));

  if (phone) {
    const users = await db.query('SELECT id FROM users WHERE role = 2 AND phone = ?', [phone]);
    users.forEach((row) => providerIds.add(row.id));
    const providers = await db.query('SELECT id FROM service_providers WHERE phone = ?', [phone]);
    providers.forEach((row) => providerIds.add(row.id));
  }

  const ids = [...providerIds].filter(Boolean);
  if (!ids.length) return;

  const placeholders = ids.map(() => '?').join(', ');
  const services = await db.query(
    `SELECT id FROM services WHERE provider_id IN (${placeholders})`,
    ids
  );

  for (const service of services) {
    await db.execute('DELETE FROM service_packages WHERE service_id = ?', [service.id]);
    await db.execute('DELETE FROM provider_services WHERE service_id = ?', [service.id]);
    await db.execute('DELETE FROM services WHERE id = ?', [service.id]);
  }
}

async function getProvidersForService(service) {
  if (!service) return [];

  const params = [JSON.stringify(service.type_id)];
  let sql = `
    SELECT sp.id, sp.nickname AS name, sp.avatar_url, sp.level,
           sp.avg_rating AS rating, sp.total_services AS services,
           sp.available, sp.status
    FROM service_providers sp
    INNER JOIN users u ON u.role = 2 AND (u.openid = sp.openid OR u.phone = sp.phone)
    WHERE sp.status = 1 AND u.status = 1
      AND JSON_CONTAINS(u.service_types, ?)
  `;

  if (service.provider_id) {
    sql += ' OR sp.id = ?';
    params.push(service.provider_id);
  }

  sql += ' GROUP BY sp.id ORDER BY sp.avg_rating DESC, sp.total_services DESC';

  const rows = await db.query(sql, params);
  return rows.map((row) => ({
    id: row.id,
    name: row.name || '服务人员',
    avatar_url: row.avatar_url || '',
    level: row.level || 0,
    level_name: getLevelName(row.level || 0),
    rating: parseFloat(row.rating || 0).toFixed(1),
    services: row.services || 0,
    available: row.available === 1 && row.status === 1,
    skills: []
  }));
}

async function cleanupOrphanServices() {
  const orphans = await db.query(`
    SELECT s.id FROM services s
    LEFT JOIN service_providers sp ON s.provider_id = sp.id
    LEFT JOIN users u ON s.provider_id = u.id AND u.role = 2
    WHERE s.provider_id IS NOT NULL AND sp.id IS NULL AND u.id IS NULL
  `);

  for (const service of orphans) {
    await db.execute('DELETE FROM service_packages WHERE service_id = ?', [service.id]);
    await db.execute('DELETE FROM provider_services WHERE service_id = ?', [service.id]);
    await db.execute('DELETE FROM services WHERE id = ?', [service.id]);
  }

  return orphans.length;
}

async function ensureServiceColumns() {
  const columns = [
    "ADD COLUMN card_type TINYINT DEFAULT 1 COMMENT '1单次卡 2多次卡'",
    "ADD COLUMN card_count INT DEFAULT 1 COMMENT '可用次数'"
  ];

  for (const clause of columns) {
    try {
      await db.execute(`ALTER TABLE services ${clause}`);
    } catch (error) {
      if (!/Duplicate column name/i.test(error.message)) {
        throw error;
      }
    }
  }
}

module.exports = {
  parseJsonField,
  buildImageList,
  buildPurchaseOptions,
  buildPurchaseOptionsAsync,
  parseLevelPrices,
  resolveServicePrice,
  buildScheduleInfo,
  formatServiceDetail,
  formatServiceDetailAsync,
  resolveServicePublisher,
  getProvidersByTypeId,
  getServiceProviderIdByUserId,
  deleteServicesByProvider,
  getProvidersForService,
  cleanupOrphanServices,
  ensureServiceColumns
};
