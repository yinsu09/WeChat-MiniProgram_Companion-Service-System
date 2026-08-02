const db = require('./db');

async function addColumnIfMissing(table, clause) {
  try {
    await db.execute(`ALTER TABLE ${table} ${clause}`);
  } catch (error) {
    if (!/Duplicate column name/i.test(error.message)) {
      throw error;
    }
  }
}

async function ensureSchema() {
  const couponColumns = [
    "ADD COLUMN points_cost INT DEFAULT 0 COMMENT '积分兑换所需积分'",
    "ADD COLUMN description TEXT",
    "ADD COLUMN location VARCHAR(200)",
    "ADD COLUMN service_types TEXT",
    "ADD COLUMN user_limit INT DEFAULT 1",
    "ADD COLUMN provider_id INT",
    "ADD COLUMN used_count INT DEFAULT 0",
    "ADD COLUMN group_success TINYINT DEFAULT 0 COMMENT '组团是否成功'",
    "ADD COLUMN provider_assign_status TINYINT DEFAULT 0 COMMENT '0无 1待确认 2已接受 3已拒绝'",
    "ADD COLUMN pending_provider_id INT NULL COMMENT '待确认的服务人员'"
  ];

  for (const clause of couponColumns) {
    await addColumnIfMissing('coupons', clause);
  }

  await db.execute(`
    UPDATE coupons
    SET provider_assign_status = 2
    WHERE type = 3 AND provider_id IS NOT NULL
      AND (provider_assign_status IS NULL OR provider_assign_status = 0)
  `).catch(() => {});

  const notificationColumns = [
    "ADD COLUMN ref_type VARCHAR(50) NULL COMMENT '关联类型'",
    "ADD COLUMN ref_id INT NULL COMMENT '关联ID'"
  ];
  for (const clause of notificationColumns) {
    await addColumnIfMissing('notifications', clause);
  }

  const userCouponColumns = [
    "ADD COLUMN name VARCHAR(100)",
    "ADD COLUMN type_name VARCHAR(50)",
    "ADD COLUMN value DECIMAL(10,2) DEFAULT 0",
    "ADD COLUMN min_amount DECIMAL(10,2) DEFAULT 0",
    "ADD COLUMN expire_time DATETIME",
    "ADD COLUMN is_new TINYINT DEFAULT 0 COMMENT '未读新券'",
    "ADD COLUMN source_activity_id INT NULL COMMENT '来源新手礼包活动ID'"
  ];

  for (const clause of userCouponColumns) {
    await addColumnIfMissing('user_coupons', clause);
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_newuser_gift_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      activity_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_activity (user_id, activity_id),
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => {});

  try {
    await db.execute('ALTER TABLE user_coupons MODIFY COLUMN coupon_id INT NULL');
  } catch (_) {
    // ignore if already nullable or column differs
  }

  const orderColumns = [
    "ADD COLUMN custom_requirements TEXT COMMENT '定制服务要求'",
    "ADD COLUMN user_coupon_id INT COMMENT '使用的用户优惠券'",
    "ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0 COMMENT '优惠券抵扣'",
    "ADD COLUMN is_custom TINYINT DEFAULT 0 COMMENT '是否定制指定服务'",
    "ADD COLUMN group_activity_id INT COMMENT '组团游活动ID'",
    "ADD COLUMN promotion_discount DECIMAL(10,2) DEFAULT 0 COMMENT '限时折扣优惠'",
    "ADD COLUMN discount_id INT COMMENT '限时折扣活动ID'",
    "ADD COLUMN points_awarded INT DEFAULT 0 COMMENT '已发放消费积分'"
  ];

  for (const clause of orderColumns) {
    await addColumnIfMissing('orders', clause);
  }

  const orderExtraColumns = [
    "ADD COLUMN cancel_reason TEXT COMMENT '取消原因'",
    "ADD COLUMN reject_reason TEXT COMMENT '拒单原因'",
    "ADD COLUMN refund_result VARCHAR(20) NULL COMMENT 'none/pending/approved/rejected'",
    "ADD COLUMN refund_reject_reason TEXT COMMENT '退款拒绝原因'"
  ];
  for (const clause of orderExtraColumns) {
    await addColumnIfMissing('orders', clause);
  }

  const orderCompletionColumns = [
    "ADD COLUMN user_complete_confirmed TINYINT DEFAULT 0 COMMENT '用户确认完成'",
    "ADD COLUMN provider_complete_confirmed TINYINT DEFAULT 0 COMMENT '服务人员确认完成'",
    "ADD COLUMN service_paused TINYINT DEFAULT 0 COMMENT '服务暂停'"
  ];
  for (const clause of orderCompletionColumns) {
    await addColumnIfMissing('orders', clause);
  }

  await addColumnIfMissing('service_types', "ADD COLUMN level_price_ranges TEXT COMMENT '各等级价格区间JSON'");
  await addColumnIfMissing('service_providers', "ADD COLUMN work_mode TINYINT DEFAULT 1 COMMENT '0休息 1工作'");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS after_sales_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      user_id INT NOT NULL,
      type VARCHAR(30) DEFAULT 'refund' COMMENT 'refund/end_early/dispute',
      reason TEXT NOT NULL,
      images TEXT,
      status TINYINT DEFAULT 0 COMMENT '0待处理 1已同意 2已拒绝',
      admin_reply TEXT,
      refund_amount DECIMAL(10,2) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_order_id (order_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => {});

  await db.execute(`
    CREATE TABLE IF NOT EXISTS provider_rest_periods (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider_id INT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_provider_id (provider_id),
      INDEX idx_time (start_time, end_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => {});

  await db.execute(`
    CREATE TABLE IF NOT EXISTS points_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      order_id INT NULL,
      type_name VARCHAR(100) NOT NULL,
      points INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_order_id (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => {});

  const userColumns = [
    "ADD COLUMN weekdays TEXT",
    "ADD COLUMN time_slots TEXT",
    "ADD COLUMN service_area VARCHAR(500)",
    "ADD COLUMN points INT DEFAULT 0",
    "ADD COLUMN total_consumed DECIMAL(10,2) DEFAULT 0"
  ];

  for (const clause of userColumns) {
    await addColumnIfMissing('users', clause);
  }

  const serviceColumns = [
    "ADD COLUMN level_prices TEXT COMMENT '铜银金分级定价JSON'"
  ];
  for (const clause of serviceColumns) {
    await addColumnIfMissing('services', clause);
  }

  await ensureReviewsSchema();
}

async function ensureReviewsSchema() {
  const tables = await db.query("SHOW TABLES LIKE 'reviews'");
  if (!tables.length) {
    await db.execute(`
      CREATE TABLE reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        reviewer_type VARCHAR(20) NOT NULL DEFAULT 'user',
        user_id INT NOT NULL,
        provider_id INT NOT NULL,
        service_id INT NULL,
        overall_rating DECIMAL(3,1) DEFAULT 0,
        professional_rating DECIMAL(3,1) DEFAULT 0,
        attitude_rating DECIMAL(3,1) DEFAULT 0,
        punctual_rating DECIMAL(3,1) DEFAULT 0,
        cooperation_rating DECIMAL(3,1) DEFAULT 0,
        communication_rating DECIMAL(3,1) DEFAULT 0,
        content TEXT,
        images TEXT,
        behavior_tags TEXT,
        is_anonymous TINYINT DEFAULT 0,
        status TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_order_reviewer (order_id, reviewer_type),
        INDEX idx_provider (provider_id),
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    return;
  }

  const reviewColumns = [
    "ADD COLUMN reviewer_type VARCHAR(20) NOT NULL DEFAULT 'user'",
    'ADD COLUMN user_id INT NULL',
    'ADD COLUMN provider_id INT NULL',
    'ADD COLUMN service_id INT NULL',
    'ADD COLUMN overall_rating DECIMAL(3,1) DEFAULT 0',
    'ADD COLUMN professional_rating DECIMAL(3,1) DEFAULT 0',
    'ADD COLUMN attitude_rating DECIMAL(3,1) DEFAULT 0',
    'ADD COLUMN punctual_rating DECIMAL(3,1) DEFAULT 0',
    'ADD COLUMN cooperation_rating DECIMAL(3,1) DEFAULT 0',
    'ADD COLUMN communication_rating DECIMAL(3,1) DEFAULT 0',
    'ADD COLUMN content TEXT',
    'ADD COLUMN behavior_tags TEXT',
    'ADD COLUMN is_anonymous TINYINT DEFAULT 0'
  ];

  for (const clause of reviewColumns) {
    await addColumnIfMissing('reviews', clause);
  }

  try {
    await db.execute('ALTER TABLE reviews DROP INDEX order_id');
  } catch (_) {
    // ignore if index name differs
  }

  try {
    await db.execute('ALTER TABLE reviews ADD UNIQUE KEY uk_order_reviewer (order_id, reviewer_type)');
  } catch (_) {
    // ignore if already exists
  }

  const cols = await db.query('SHOW COLUMNS FROM reviews');
  const colNames = cols.map((c) => c.Field);

  if (colNames.includes('from_user')) {
    try {
      await db.execute('ALTER TABLE reviews MODIFY COLUMN from_user INT NULL');
      await db.execute('ALTER TABLE reviews MODIFY COLUMN to_user INT NULL');
      await db.execute('ALTER TABLE reviews MODIFY COLUMN rating INT NULL');
    } catch (_) {}
  }

  await db.execute(`
    UPDATE reviews r
    INNER JOIN orders o ON r.order_id = o.id
    SET r.user_id = COALESCE(r.user_id, o.user_id),
        r.provider_id = COALESCE(r.provider_id, o.provider_id),
        r.service_id = COALESCE(r.service_id, o.service_id)
    WHERE r.user_id IS NULL OR r.provider_id IS NULL
  `).catch(() => {});

  if (colNames.includes('from_user') && colNames.includes('rating')) {
    await db.execute(`
      UPDATE reviews
      SET user_id = COALESCE(user_id, from_user),
          overall_rating = COALESCE(NULLIF(overall_rating, 0), rating),
          content = COALESCE(content, comment),
          reviewer_type = COALESCE(NULLIF(reviewer_type, ''), 'user')
      WHERE reviewer_type = 'user' OR reviewer_type IS NULL OR reviewer_type = ''
    `).catch(() => {});
  }
}

module.exports = { ensureSchema };
