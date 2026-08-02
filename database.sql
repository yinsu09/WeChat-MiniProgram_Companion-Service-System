-- 陪伴服务系统数据库设计

-- 用户表
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    openid VARCHAR(100) UNIQUE NOT NULL,
    nickname VARCHAR(100),
    avatar_url VARCHAR(500),
    phone VARCHAR(20),
    password VARCHAR(255) COMMENT '登录密码',
    real_name VARCHAR(50),
    id_card VARCHAR(20),
    gender TINYINT DEFAULT 0 COMMENT '0-未知 1-男 2-女',
    role TINYINT DEFAULT 1 COMMENT '1-普通用户 2-服务人员 3-管理员',
    service_types TEXT COMMENT '服务类型，JSON数组（服务人员专用）',
    status TINYINT DEFAULT 1 COMMENT '0-禁用/待审核 1-正常',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 服务人员表
CREATE TABLE service_providers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    openid VARCHAR(100) UNIQUE NOT NULL,
    nickname VARCHAR(100),
    avatar_url VARCHAR(500),
    phone VARCHAR(20) NOT NULL,
    real_name VARCHAR(50) NOT NULL,
    id_card VARCHAR(20) UNIQUE NOT NULL,
    level INT DEFAULT 1 COMMENT '服务等级1-10星',
    total_services INT DEFAULT 0 COMMENT '完成服务总数',
    avg_rating DECIMAL(3,2) DEFAULT 0 COMMENT '平均评分',
    status TINYINT DEFAULT 1 COMMENT '0-禁用 1-正常 2-审核中',
    available TINYINT DEFAULT 1 COMMENT '0-忙碌 1-空闲',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 服务类型表
CREATE TABLE service_types (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL COMMENT '服务类型名称',
    icon VARCHAR(200) COMMENT '图标路径',
    description TEXT COMMENT '描述',
    sort_order INT DEFAULT 0,
    status TINYINT DEFAULT 1 COMMENT '0-下架 1-上架',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 服务项目表
CREATE TABLE services (
    id INT PRIMARY KEY AUTO_INCREMENT,
    provider_id INT COMMENT '服务人员ID',
    type_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    duration INT NOT NULL COMMENT '服务时长（分钟）',
    base_price DECIMAL(10,2) NOT NULL COMMENT '基础价格',
    level_requirement INT DEFAULT 1 COMMENT '会员等级要求',
    cover_image VARCHAR(500),
    images TEXT COMMENT '服务图片，JSON数组',
    features TEXT COMMENT '服务特色，JSON数组',
    weekdays TEXT COMMENT '服务日期，JSON数组',
    time_slots TEXT COMMENT '服务时段，JSON数组',
    service_area VARCHAR(500) COMMENT '服务区域',
    card_type TINYINT DEFAULT 1 COMMENT '1-单次卡 2-多次卡',
    card_count INT DEFAULT 1 COMMENT '可用次数',
    is_recommend TINYINT DEFAULT 0 COMMENT '是否推荐',
    status TINYINT DEFAULT 1 COMMENT '0-下架 1-上架',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (type_id) REFERENCES service_types(id)
);

-- 服务套餐表（多次卡）
CREATE TABLE service_packages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    service_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    count INT NOT NULL COMMENT '服务次数',
    discount DECIMAL(5,2) DEFAULT 1 COMMENT '折扣比例',
    price DECIMAL(10,2) NOT NULL COMMENT '套餐价格',
    status TINYINT DEFAULT 1 COMMENT '0-下架 1-上架',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id) REFERENCES services(id)
);

-- 服务人员可服务项目
CREATE TABLE provider_services (
    id INT PRIMARY KEY AUTO_INCREMENT,
    provider_id INT NOT NULL,
    service_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES service_providers(id),
    FOREIGN KEY (service_id) REFERENCES services(id),
    UNIQUE KEY (provider_id, service_id)
);

-- 服务人员日程表
CREATE TABLE provider_schedule (
    id INT PRIMARY KEY AUTO_INCREMENT,
    provider_id INT NOT NULL,
    date DATE NOT NULL,
    time_slots TEXT COMMENT '可用时间段，JSON数组',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES service_providers(id)
);

-- 订单表
CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(32) UNIQUE NOT NULL COMMENT '订单编号',
    user_id INT NOT NULL,
    provider_id INT COMMENT '服务人员ID',
    service_id INT NOT NULL,
    package_id INT COMMENT '套餐ID',
    service_count INT DEFAULT 1 COMMENT '服务次数',
    scheduled_date DATE NOT NULL,
    scheduled_time VARCHAR(20) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    paid_amount DECIMAL(10,2) DEFAULT 0,
    status TINYINT DEFAULT 0 COMMENT '0-待支付 1-待接单 2-待服务 3-服务中 4-完成 5-取消 6-退费中 7-已退费',
    payment_method VARCHAR(20),
    payment_time DATETIME,
    refund_amount DECIMAL(10,2) DEFAULT 0,
    refund_reason TEXT,
    assign_type TINYINT DEFAULT 0 COMMENT '0-系统指派 1-用户自选',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (provider_id) REFERENCES service_providers(id),
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (package_id) REFERENCES service_packages(id)
);

-- 订单服务记录表
CREATE TABLE order_services (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    service_date DATE,
    start_time VARCHAR(20),
    end_time VARCHAR(20),
    status TINYINT DEFAULT 0 COMMENT '0-未使用 1-已使用 2-已取消',
    used_by_provider INT COMMENT '实际服务人员',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (used_by_provider) REFERENCES service_providers(id)
);

-- 评价表（双向：用户评服务人员 / 服务人员评用户）
CREATE TABLE reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    reviewer_type VARCHAR(20) NOT NULL DEFAULT 'user' COMMENT 'user-用户评价 provider-服务人员评价',
    user_id INT NOT NULL COMMENT '订单用户ID',
    provider_id INT NOT NULL COMMENT '服务人员ID',
    service_id INT COMMENT '服务项目ID',
    overall_rating DECIMAL(3,1) DEFAULT 0 COMMENT '综合评分',
    professional_rating DECIMAL(3,1) DEFAULT 0 COMMENT '专业度（用户评价）',
    attitude_rating DECIMAL(3,1) DEFAULT 0 COMMENT '服务态度',
    punctual_rating DECIMAL(3,1) DEFAULT 0 COMMENT '准时程度（用户评价）',
    cooperation_rating DECIMAL(3,1) DEFAULT 0 COMMENT '配合程度（服务人员评价）',
    communication_rating DECIMAL(3,1) DEFAULT 0 COMMENT '沟通表现（服务人员评价）',
    content TEXT COMMENT '评价内容',
    images TEXT COMMENT '评价图片，JSON数组',
    behavior_tags TEXT COMMENT '行为标签，JSON数组',
    is_anonymous TINYINT DEFAULT 0 COMMENT '是否匿名',
    status TINYINT DEFAULT 1 COMMENT '0-隐藏 1-显示',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_order_reviewer (order_id, reviewer_type),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (provider_id) REFERENCES service_providers(id)
);

-- 用户积分表
CREATE TABLE user_points (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    points INT DEFAULT 0 COMMENT '当前积分',
    total_earned INT DEFAULT 0 COMMENT '累计获得',
    total_spent INT DEFAULT 0 COMMENT '累计消耗',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 积分变动记录
CREATE TABLE point_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    type TINYINT NOT NULL COMMENT '1-获得 2-消耗',
    amount INT NOT NULL,
    source VARCHAR(100) COMMENT '来源描述',
    order_id INT COMMENT '关联订单',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- 优惠券表
CREATE TABLE coupons (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    type TINYINT DEFAULT 1 COMMENT '1-满减券 2-折扣券',
    discount_value DECIMAL(10,2) NOT NULL,
    min_amount DECIMAL(10,2) DEFAULT 0 COMMENT '最低消费',
    valid_start DATE NOT NULL,
    valid_end DATE NOT NULL,
    total_count INT DEFAULT 100,
    used_count INT DEFAULT 0,
    status TINYINT DEFAULT 1 COMMENT '0-停用 1-启用',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 用户优惠券表
CREATE TABLE user_coupons (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    coupon_id INT NOT NULL,
    status TINYINT DEFAULT 1 COMMENT '1-未使用 2-已使用 3-已过期',
    used_order_id INT COMMENT '使用的订单',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (coupon_id) REFERENCES coupons(id),
    FOREIGN KEY (used_order_id) REFERENCES orders(id)
);

-- 管理员表
CREATE TABLE admins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nickname VARCHAR(50),
    status TINYINT DEFAULT 1 COMMENT '0-禁用 1-正常',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 系统通知表
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    provider_id INT,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    type TINYINT DEFAULT 1 COMMENT '1-系统通知 2-订单通知 3-评价通知',
    `read` TINYINT DEFAULT 0 COMMENT '0-未读 1-已读',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (provider_id) REFERENCES service_providers(id)
);

-- 初始化数据
INSERT INTO service_types (name, icon, description, sort_order) VALUES
('陪诊', '🏥', '专业陪诊服务，帮助您就医问诊', 1),
('陪护', '👩‍⚕️', '贴心陪护服务，陪伴您的每一天', 2),
('陪玩', '🎮', '有趣玩伴陪伴，欢乐时光共享', 3),
('陪吃', '🍽️', '美食相伴，品味人生', 4),
('陪游', '🗺️', '专业导游，带你领略美景', 5),
('陪学', '📚', '学习陪伴，共同进步', 6),
('陪聊', '💬', '倾听陪伴，倾诉心声', 7);

-- 系统配置表
CREATE TABLE system_configs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    config_key VARCHAR(100) UNIQUE NOT NULL COMMENT '配置键',
    config_value TEXT COMMENT '配置值（JSON格式）',
    description VARCHAR(500) COMMENT '配置描述',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO admins (username, password, nickname) VALUES
('admin', 'admin123', '系统管理员');

-- 初始化分级规则配置
INSERT INTO system_configs (config_key, config_value, description) VALUES
('provider_level_rules', '{"service_count":{"bronze":0,"silver":50,"gold":100},"rating":{"bronze":3.0,"silver":4.0,"gold":4.5},"demote":{"bad_review_count":5,"min_rating":3.5}}', '服务人员分级规则配置');
