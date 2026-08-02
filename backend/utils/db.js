const mysql = require('mysql2/promise');
const config = require('../config/database');

const pool = mysql.createPool({
  ...config,
  charset: 'utf8mb4',
  collation: 'utf8mb4_unicode_ci'
});

async function query(sql, params = []) {
  const connection = await pool.getConnection();
  try {
    await connection.execute('SET NAMES utf8mb4');
    await connection.execute('SET CHARACTER SET utf8mb4');
    const [rows] = await connection.query(sql, params);
    return rows;
  } finally {
    connection.release();
  }
}

async function execute(sql, params = []) {
  const connection = await pool.getConnection();
  try {
    await connection.execute('SET NAMES utf8mb4');
    await connection.execute('SET CHARACTER SET utf8mb4');
    const [result] = await connection.query(sql, params);
    return result;
  } finally {
    connection.release();
  }
}

async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.execute('SET NAMES utf8mb4');
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { query, execute, withTransaction, pool };