const db = require('../utils/db');

class AfterSales {
  static async create(data) {
    const {
      order_id, user_id, type, reason, images = []
    } = data;
    const result = await db.execute(
      `INSERT INTO after_sales_requests
       (order_id, user_id, type, reason, images, status)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [
        order_id,
        user_id,
        type || 'refund',
        reason,
        typeof images === 'string' ? images : JSON.stringify(images || [])
      ]
    );
    return result.insertId;
  }

  static async findByOrderId(orderId) {
    const rows = await db.query(
      `SELECT * FROM after_sales_requests WHERE order_id = ? ORDER BY created_at DESC`,
      [orderId]
    );
    return rows.map((row) => ({
      ...row,
      images: AfterSales.parseImages(row.images)
    }));
  }

  static async findById(id) {
    const rows = await db.query(
      `SELECT a.*, o.order_no, o.total_price, o.paid_amount, o.status AS order_status,
              u.nickname AS user_name, u.phone AS user_phone,
              s.name AS service_name, p.nickname AS provider_name
       FROM after_sales_requests a
       LEFT JOIN orders o ON a.order_id = o.id
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN service_providers p ON o.provider_id = p.id
       WHERE a.id = ?`,
      [id]
    );
    if (!rows.length) return null;
    return {
      ...rows[0],
      images: AfterSales.parseImages(rows[0].images)
    };
  }

  static async list({ status, page = 1, limit = 20 }) {
    let sql = `
      SELECT a.*, o.order_no, o.total_price, u.nickname AS user_name,
             s.name AS service_name, p.nickname AS provider_name
      FROM after_sales_requests a
      LEFT JOIN orders o ON a.order_id = o.id
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN services s ON o.service_id = s.id
      LEFT JOIN service_providers p ON o.provider_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (status !== undefined && status !== '' && status !== 'all') {
      sql += ' AND a.status = ?';
      params.push(parseInt(status, 10));
    }
    sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), (parseInt(page, 10) - 1) * parseInt(limit, 10));

    const rows = await db.query(sql, params);
    let countSql = 'SELECT COUNT(*) AS total FROM after_sales_requests WHERE 1=1';
    const countParams = [];
    if (status !== undefined && status !== '' && status !== 'all') {
      countSql += ' AND status = ?';
      countParams.push(parseInt(status, 10));
    }
    const countRows = await db.query(countSql, countParams);

    return {
      rows: rows.map((row) => ({
        ...row,
        images: AfterSales.parseImages(row.images)
      })),
      total: countRows[0]?.total || 0
    };
  }

  static parseImages(raw) {
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  static async updateStatus(id, status, extra = {}) {
    const fields = ['status = ?'];
    const params = [status];
    if (extra.admin_reply !== undefined) {
      fields.push('admin_reply = ?');
      params.push(extra.admin_reply);
    }
    if (extra.refund_amount !== undefined) {
      fields.push('refund_amount = ?');
      params.push(extra.refund_amount);
    }
    params.push(id);
    await db.execute(
      `UPDATE after_sales_requests SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
  }

  static async hasPending(orderId) {
    const rows = await db.query(
      'SELECT id FROM after_sales_requests WHERE order_id = ? AND status = 0 LIMIT 1',
      [orderId]
    );
    return rows.length > 0;
  }
}

module.exports = AfterSales;
