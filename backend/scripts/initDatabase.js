const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function initDatabase() {
  const config = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    multipleStatements: true
  };

  let connection;
  
  try {
    connection = await mysql.createConnection(config);
    console.log('✅ 连接数据库成功');

    await connection.query('DROP DATABASE IF EXISTS companion_service');
    console.log('✅ 删除旧数据库');

    await connection.query('CREATE DATABASE companion_service');
    console.log('✅ 创建数据库成功');

    await connection.query('USE companion_service');
    console.log('✅ 选择数据库成功');

    const sqlFile = path.join(__dirname, '../../database.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    await connection.query(sql);
    console.log('✅ 执行SQL脚本成功');

    console.log('\n🎉 数据库初始化完成！');
    console.log('====================================');
    console.log('管理员账号：');
    console.log('  用户名：admin');
    console.log('  密码：admin123');
    console.log('====================================');

  } catch (error) {
    console.error('❌ 初始化失败:', error.message);
    console.error('\n请确保：');
    console.error('1. MySQL服务已启动');
    console.error('2. 数据库配置正确（backend/config/database.js）');
    console.error('3. 已安装mysql2依赖（npm install mysql2）');
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initDatabase();