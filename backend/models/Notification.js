const { query, execute } = require('../utils/db');

class Notification {
  static async create(data) {
    const { user_id, title, content, type = 1, ref_type = null, ref_id = null } = data;
    const sql = 'INSERT INTO notifications (user_id, title, content, type, ref_type, ref_id, `read`, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())';
    const result = await execute(sql, [user_id, title, content, type, ref_type, ref_id]);
    return result.insertId;
  }

  static mapType(type) {
    if (Number(type) === 2) return 'order';
    if (Number(type) === 3) return 'review';
    if (Number(type) === 4) return 'group';
    return 'system';
  }

  static mapIcon(type) {
    if (Number(type) === 2) return '📋';
    if (Number(type) === 3) return '⭐';
    if (Number(type) === 4) return '🚌';
    return '🔔';
  }

  static async getByUser(userId) {
    const sql = 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC';
    const rows = await query(sql, [userId]);
    return rows.map((row) => ({
      id: row.id,
      type: this.mapType(row.type),
      icon: this.mapIcon(row.type),
      title: row.title,
      content: row.content,
      created_at: row.created_at,
      is_read: row.read === 1,
      ref_type: row.ref_type || null,
      ref_id: row.ref_id || null
    }));
  }

  static async getUnreadCount(userId) {
    const sql = 'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND `read` = 0';
    const rows = await query(sql, [userId]);
    return rows[0].count || 0;
  }

  static async markAsRead(notificationId, userId) {
    const sql = 'UPDATE notifications SET `read` = 1 WHERE id = ? AND user_id = ?';
    await execute(sql, [notificationId, userId]);
  }
}

module.exports = Notification;