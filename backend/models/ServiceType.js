const { query, execute } = require('../utils/db');

class ServiceType {
  static async findAll() {
    const rows = await query('SELECT * FROM service_types WHERE status = 1 ORDER BY sort_order');
    return rows;
  }

  static async findAllWithDisabled() {
    const rows = await query('SELECT * FROM service_types ORDER BY sort_order');
    return rows;
  }

  static async findById(id) {
    const rows = await query('SELECT * FROM service_types WHERE id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { name, icon, description, sort_order } = data;
    const result = await execute(
      'INSERT INTO service_types (name, icon, description, sort_order) VALUES (?, ?, ?, ?)',
      [name, icon, description, sort_order]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const fields = [];
    const params = [];
    Object.keys(data).forEach(key => {
      fields.push(`${key} = ?`);
      params.push(data[key]);
    });
    params.push(id);
    await execute(`UPDATE service_types SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  static async delete(id) {
    await execute('UPDATE service_types SET status = 0 WHERE id = ?', [id]);
  }
}

module.exports = ServiceType;
