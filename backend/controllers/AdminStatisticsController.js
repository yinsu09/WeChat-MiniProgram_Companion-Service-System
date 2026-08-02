const db = require('../utils/db');
const fs = require('fs');
const path = require('path');
const { revenueSumSql, REVENUE_STATUS_WHERE, REVENUE_AMOUNT_EXPR } = require('../utils/revenueHelper');

function getDateRange(req) {
  const start = req.query.start_date || req.query.startDate
    || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const end = req.query.end_date || req.query.endDate
    || new Date().toISOString().split('T')[0];
  return { start, end };
}

function calcGrowth(current, previous) {
  const cur = parseFloat(current) || 0;
  const prev = parseFloat(previous) || 0;
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
}

function previousRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const days = Math.max(Math.round((endDate - startDate) / (24 * 60 * 60 * 1000)), 1);
  const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    prevStart: prevStart.toISOString().split('T')[0],
    prevEnd: prevEnd.toISOString().split('T')[0]
  };
}

class AdminStatisticsController {
  static async getStatistics(req, res) {
    try {
      const { start, end } = getDateRange(req);
      const { prevStart, prevEnd } = previousRange(start, end);

      const revenueResult = await db.query(
        `SELECT ${revenueSumSql('o')} as total FROM orders o
         WHERE ${REVENUE_STATUS_WHERE}
         AND DATE(o.created_at) BETWEEN ? AND ?`,
        [start, end]
      );
      const prevRevenueResult = await db.query(
        `SELECT ${revenueSumSql('o')} as total FROM orders o
         WHERE ${REVENUE_STATUS_WHERE}
         AND DATE(o.created_at) BETWEEN ? AND ?`,
        [prevStart, prevEnd]
      );
      const orderResult = await db.query(
        'SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) BETWEEN ? AND ?',
        [start, end]
      );
      const prevOrderResult = await db.query(
        'SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) BETWEEN ? AND ?',
        [prevStart, prevEnd]
      );
      const userResult = await db.query(
        'SELECT COUNT(*) as count FROM users WHERE role = 1 AND DATE(created_at) BETWEEN ? AND ?',
        [start, end]
      );
      const prevUserResult = await db.query(
        'SELECT COUNT(*) as count FROM users WHERE role = 1 AND DATE(created_at) BETWEEN ? AND ?',
        [prevStart, prevEnd]
      );
      const refundResult = await db.query(
        'SELECT COUNT(*) as count FROM orders WHERE status IN (5, 6, 7) AND DATE(created_at) BETWEEN ? AND ?',
        [start, end]
      );
      const prevRefundResult = await db.query(
        'SELECT COUNT(*) as count FROM orders WHERE status IN (5, 6, 7) AND DATE(created_at) BETWEEN ? AND ?',
        [prevStart, prevEnd]
      );

      const totalRevenue = parseFloat(revenueResult[0]?.total) || 0;
      const totalRevenueText = totalRevenue.toFixed(2);
      const totalOrders = orderResult[0]?.count || 0;
      const totalUsers = userResult[0]?.count || 0;
      const refundCount = refundResult[0]?.count || 0;
      const refundRate = totalOrders > 0 ? Number(((refundCount / totalOrders) * 100).toFixed(2)) : 0;
      const prevRefundCount = prevRefundResult[0]?.count || 0;
      const prevTotalOrders = prevOrderResult[0]?.count || 0;
      const prevRefundRate = prevTotalOrders > 0 ? (prevRefundCount / prevTotalOrders) * 100 : 0;

      const salesRows = await db.query(
        `SELECT st.name AS type, COUNT(o.id) AS count, IFNULL(SUM(${REVENUE_AMOUNT_EXPR}), 0) AS amount
         FROM orders o
         LEFT JOIN services s ON o.service_id = s.id
         LEFT JOIN service_types st ON s.type_id = st.id
         WHERE ${REVENUE_STATUS_WHERE} AND DATE(o.created_at) BETWEEN ? AND ?
         GROUP BY st.id, st.name
         ORDER BY amount DESC`,
        [start, end]
      );
      const totalSalesAmount = salesRows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
      const salesData = salesRows.map((row) => {
        const amount = parseFloat(row.amount) || 0;
        return {
          type: row.type || '其他',
          count: row.count || 0,
          amount: amount.toFixed(2),
          percentage: totalSalesAmount > 0 ? Math.round((amount / totalSalesAmount) * 100) : 0
        };
      });

      const hotServiceRows = await db.query(
        `SELECT s.id, s.name, st.name AS type_name, s.cover_image AS image,
                COUNT(o.id) AS orders, IFNULL(SUM(${REVENUE_AMOUNT_EXPR}), 0) AS revenue
         FROM services s
         LEFT JOIN service_types st ON s.type_id = st.id
         LEFT JOIN orders o ON s.id = o.service_id AND ${REVENUE_STATUS_WHERE}
           AND DATE(o.created_at) BETWEEN ? AND ?
         WHERE s.name NOT LIKE '【定制】%' AND s.name NOT LIKE '【组团】%'
         GROUP BY s.id, s.name, st.name, s.cover_image
         ORDER BY orders DESC, revenue DESC
         LIMIT 10`,
        [start, end]
      );
      const hotServices = hotServiceRows.map((row, index) => ({
        id: row.id,
        name: row.name,
        type: row.type_name || '服务',
        image: row.image || '',
        orders: row.orders || 0,
        revenue: parseFloat(row.revenue || 0).toFixed(2),
        rank: index + 1
      }));

      const hotProviderRows = await db.query(
        `SELECT p.id, p.nickname AS name, p.avatar_url AS avatar, p.level,
                p.avg_rating AS rating, COUNT(o.id) AS services
         FROM service_providers p
         LEFT JOIN orders o ON p.id = o.provider_id AND ${REVENUE_STATUS_WHERE}
           AND DATE(o.created_at) BETWEEN ? AND ?
         GROUP BY p.id, p.nickname, p.avatar_url, p.level, p.avg_rating
         ORDER BY services DESC
         LIMIT 10`,
        [start, end]
      );
      const levelNames = { 0: '新手', 1: '铜牌', 2: '银牌', 3: '金牌' };
      const hotProviders = hotProviderRows.map((row, index) => ({
        id: row.id,
        name: row.name || '服务人员',
        avatar: row.avatar || '',
        level: row.level || 0,
        levelName: levelNames[row.level] || '铜牌',
        rating: parseFloat(row.rating || 0).toFixed(1),
        services: row.services || 0,
        rank: index + 1
      }));

      const avgOrderResult = await db.query(
        `SELECT IFNULL(AVG(${REVENUE_AMOUNT_EXPR}), 0) AS avg_amount FROM orders o
         WHERE ${REVENUE_STATUS_WHERE} AND DATE(o.created_at) BETWEEN ? AND ?`,
        [start, end]
      );
      const repeatResult = await db.query(
        `SELECT COUNT(*) AS repeat_users FROM (
           SELECT user_id FROM orders o
           WHERE ${REVENUE_STATUS_WHERE} AND DATE(o.created_at) BETWEEN ? AND ?
           GROUP BY user_id HAVING COUNT(*) > 1
         ) t`,
        [start, end]
      );
      const activeUserResult = await db.query(
        `SELECT COUNT(DISTINCT user_id) AS count FROM orders
         WHERE DATE(created_at) BETWEEN ? AND ?`,
        [start, end]
      );
      const newUserResult = await db.query(
        `SELECT COUNT(*) AS count FROM users
         WHERE role = 1 AND DATE(created_at) BETWEEN ? AND ?`,
        [start, end]
      );
      const repeatUsers = repeatResult[0]?.repeat_users || 0;
      const activeUsers = activeUserResult[0]?.count || 0;
      const repeatRate = activeUsers > 0 ? Number(((repeatUsers / activeUsers) * 100).toFixed(1)) : 0;

      const levelDistResult = await db.query(
        `SELECT
          SUM(CASE WHEN total_spent >= 1000 THEN 1 ELSE 0 END) AS gold,
          SUM(CASE WHEN total_spent >= 300 AND total_spent < 1000 THEN 1 ELSE 0 END) AS silver,
          SUM(CASE WHEN total_spent < 300 THEN 1 ELSE 0 END) AS bronze
         FROM (
           SELECT user_id, IFNULL(SUM(${REVENUE_AMOUNT_EXPR}), 0) AS total_spent
           FROM orders o WHERE ${REVENUE_STATUS_WHERE} AND DATE(o.created_at) BETWEEN ? AND ?
           GROUP BY user_id
         ) t`,
        [start, end]
      );
      const gold = levelDistResult[0]?.gold || 0;
      const silver = levelDistResult[0]?.silver || 0;
      const bronze = levelDistResult[0]?.bronze || 0;
      const levelTotal = gold + silver + bronze || 1;

      const reasonRows = await db.query(
        `SELECT IFNULL(refund_reason, '用户取消/其他') AS reason, COUNT(*) AS count
         FROM orders
         WHERE status IN (5, 6, 7) AND DATE(created_at) BETWEEN ? AND ?
         GROUP BY IFNULL(refund_reason, '用户取消/其他')
         ORDER BY count DESC LIMIT 5`,
        [start, end]
      );
      const totalReasonCount = reasonRows.reduce((sum, row) => sum + (row.count || 0), 0) || 1;
      const refundReasons = reasonRows.map((row) => ({
        reason: row.reason,
        count: row.count,
        percentage: Math.round((row.count / totalReasonCount) * 100)
      }));

      const refundStatsResult = await db.query(
        `SELECT
          SUM(CASE WHEN status IN (5, 6, 7) THEN 1 ELSE 0 END) AS total_refunds,
          IFNULL(SUM(CASE WHEN status IN (5, 6, 7) THEN IFNULL(refund_amount, 0) ELSE 0 END), 0) AS total_amount,
          SUM(CASE WHEN status = 7 THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN status IN (5, 6, 7) THEN 1 ELSE 0 END) AS all_refund
         FROM orders WHERE DATE(created_at) BETWEEN ? AND ?`,
        [start, end]
      );
      const totalRefunds = refundStatsResult[0]?.total_refunds || 0;
      const totalRefundAmount = parseFloat(refundStatsResult[0]?.total_amount) || 0;
      const approvedRefunds = refundStatsResult[0]?.approved || 0;
      const allRefund = refundStatsResult[0]?.all_refund || 0;

      const levelTrendRows = await db.query(
        `SELECT DATE(updated_at) AS date,
                SUM(CASE WHEN level = 1 THEN 1 ELSE 0 END) AS bronze,
                SUM(CASE WHEN level = 2 THEN 1 ELSE 0 END) AS silver,
                SUM(CASE WHEN level = 3 THEN 1 ELSE 0 END) AS gold
         FROM service_providers
         WHERE DATE(updated_at) BETWEEN ? AND ?
         GROUP BY DATE(updated_at)
         ORDER BY date ASC
         LIMIT 7`,
        [start, end]
      );
      const maxTrend = Math.max(...levelTrendRows.flatMap((r) => [r.bronze, r.silver, r.gold]), 1);
      const levelTrend = levelTrendRows.map((row) => ({
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
        bronze: row.bronze || 0,
        silver: row.silver || 0,
        gold: row.gold || 0,
        bronzeHeight: Math.round(((row.bronze || 0) / maxTrend) * 100),
        silverHeight: Math.round(((row.silver || 0) / maxTrend) * 100),
        goldHeight: Math.round(((row.gold || 0) / maxTrend) * 100)
      }));

      const levelStatsRows = await db.query(
        `SELECT level, COUNT(*) AS count FROM service_providers GROUP BY level`
      );
      const levelStats = { bronze: 0, silver: 0, gold: 0, bronzeChange: 0, silverChange: 0, goldChange: 0 };
      levelStatsRows.forEach((row) => {
        if (row.level === 1) levelStats.bronze = row.count;
        if (row.level === 2) levelStats.silver = row.count;
        if (row.level === 3) levelStats.gold = row.count;
      });

      res.json({
        code: 0,
        data: {
          stats: {
            totalRevenue,
            totalRevenueText,
            totalOrders,
            totalUsers,
            refundRate,
            revenueGrowth: calcGrowth(totalRevenue, prevRevenueResult[0]?.total),
            orderGrowth: calcGrowth(totalOrders, prevOrderResult[0]?.count),
            userGrowth: calcGrowth(totalUsers, prevUserResult[0]?.count),
            refundRateChange: Number((refundRate - prevRefundRate).toFixed(2))
          },
          salesData,
          hotServices,
          hotProviders,
          userStats: {
            averageOrder: Number(parseFloat(avgOrderResult[0]?.avg_amount || 0).toFixed(2)),
            repeatRate,
            activeUsers,
            newUsers: newUserResult[0]?.count || 0,
            levelDistribution: {
              gold: Math.round((gold / levelTotal) * 100),
              silver: Math.round((silver / levelTotal) * 100),
              bronze: Math.round((bronze / levelTotal) * 100)
            }
          },
          refundReasons,
          refundStats: {
            totalRefunds,
            totalAmount: totalRefundAmount.toFixed(2),
            averageAmount: totalRefunds > 0 ? (totalRefundAmount / totalRefunds).toFixed(2) : '0.00',
            successRate: allRefund > 0 ? Math.round((approvedRefunds / allRefund) * 100) : 0
          },
          levelTrend,
          levelStats
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getSalesData(req, res) {
    try {
      const { start, end } = getDateRange(req);
      const salesData = await db.query(`
        SELECT DATE(o.created_at) as date,
               COUNT(*) as orders,
               IFNULL(SUM(${REVENUE_AMOUNT_EXPR}), 0) as revenue
        FROM orders o
        WHERE ${REVENUE_STATUS_WHERE} AND DATE(o.created_at) BETWEEN ? AND ?
        GROUP BY DATE(o.created_at)
        ORDER BY date
      `, [start, end]);

      res.json({ code: 0, data: salesData });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getHotServices(req, res) {
    try {
      const { start, end } = getDateRange(req);
      const hotServices = await db.query(`
        SELECT s.name, COUNT(o.id) as order_count
        FROM services s
        LEFT JOIN orders o ON s.id = o.service_id AND ${REVENUE_STATUS_WHERE}
          AND DATE(o.created_at) BETWEEN ? AND ?
        WHERE s.name NOT LIKE '【定制】%' AND s.name NOT LIKE '【组团】%'
        GROUP BY s.id, s.name
        ORDER BY order_count DESC
        LIMIT 10
      `, [start, end]);
      res.json({ code: 0, data: hotServices });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getHotProviders(req, res) {
    try {
      const { start, end } = getDateRange(req);
      const hotProviders = await db.query(`
        SELECT p.nickname, COUNT(o.id) as order_count
        FROM service_providers p
        LEFT JOIN orders o ON p.id = o.provider_id AND ${REVENUE_STATUS_WHERE}
          AND DATE(o.created_at) BETWEEN ? AND ?
        GROUP BY p.id, p.nickname
        ORDER BY order_count DESC
        LIMIT 10
      `, [start, end]);
      res.json({ code: 0, data: hotProviders });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getUserStats(req, res) {
    try {
      const { start, end } = getDateRange(req);
      const [totalResult] = await db.query('SELECT COUNT(*) as count FROM users WHERE role = 1');
      const [activeResult] = await db.query(
        `SELECT COUNT(DISTINCT user_id) as count FROM orders
         WHERE DATE(created_at) BETWEEN ? AND ?`,
        [start, end]
      );
      const [newResult] = await db.query(
        `SELECT COUNT(*) as count FROM users
         WHERE role = 1 AND DATE(created_at) BETWEEN ? AND ?`,
        [start, end]
      );

      res.json({
        code: 0,
        data: {
          total: totalResult[0].count,
          active: activeResult[0].count,
          new: newResult[0].count,
          retention: 0
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getRefundStats(req, res) {
    try {
      const { start, end } = getDateRange(req);
      const reasonResult = await db.query(`
        SELECT IFNULL(refund_reason, '用户取消/其他') AS refund_reason, COUNT(*) as count
        FROM orders
        WHERE status IN (5, 6, 7) AND DATE(created_at) BETWEEN ? AND ?
        GROUP BY IFNULL(refund_reason, '用户取消/其他')
        ORDER BY count DESC
        LIMIT 5
      `, [start, end]);

      const statsResult = await db.query(`
        SELECT
          SUM(CASE WHEN status = 6 THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 7 THEN 1 ELSE 0 END) as approved,
          IFNULL(SUM(CASE WHEN status IN (5, 7) THEN IFNULL(refund_amount, total_price) ELSE 0 END), 0) as total_amount
        FROM orders
        WHERE DATE(created_at) BETWEEN ? AND ?
      `, [start, end]);

      res.json({
        code: 0,
        data: {
          refundReasons: reasonResult,
          refundStats: {
            pending: statsResult[0].pending,
            approved: statsResult[0].approved,
            totalAmount: parseFloat(statsResult[0].total_amount) || 0
          }
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getLevelTrend(req, res) {
    try {
      const { start, end } = getDateRange(req);
      const levelTrend = await db.query(`
        SELECT DATE(updated_at) as date,
               SUM(CASE WHEN level = 1 THEN 1 ELSE 0 END) as bronze,
               SUM(CASE WHEN level = 2 THEN 1 ELSE 0 END) as silver,
               SUM(CASE WHEN level = 3 THEN 1 ELSE 0 END) as gold
        FROM service_providers
        WHERE DATE(updated_at) BETWEEN ? AND ?
        GROUP BY DATE(updated_at)
        ORDER BY date ASC
        LIMIT 7
      `, [start, end]);
      res.json({ code: 0, data: levelTrend });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getLevelStats(req, res) {
    try {
      const levelResult = await db.query(`
        SELECT level, COUNT(*) as count
        FROM service_providers
        GROUP BY level
      `);

      const levelStats = { novice: 0, bronze: 0, silver: 0, gold: 0 };
      levelResult.forEach((item) => {
        if (item.level === 0) levelStats.novice = item.count;
        else if (item.level === 1) levelStats.bronze = item.count;
        else if (item.level === 2) levelStats.silver = item.count;
        else if (item.level === 3) levelStats.gold = item.count;
      });

      res.json({ code: 0, data: levelStats });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async exportStatistics(req, res) {
    try {
      const { start, end } = getDateRange(req);

      const revenueResult = await db.query(
        `SELECT ${revenueSumSql('o')} as total FROM orders o
         WHERE ${REVENUE_STATUS_WHERE}
         AND DATE(o.created_at) BETWEEN ? AND ?`,
        [start, end]
      );
      const orderResult = await db.query(
        'SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) BETWEEN ? AND ?',
        [start, end]
      );
      const userResult = await db.query(
        'SELECT COUNT(*) as count FROM users WHERE role = 1 AND DATE(created_at) BETWEEN ? AND ?',
        [start, end]
      );
      const refundResult = await db.query(
        'SELECT COUNT(*) as count FROM orders WHERE status IN (5, 6, 7) AND DATE(created_at) BETWEEN ? AND ?',
        [start, end]
      );

      const salesRows = await db.query(
        `SELECT st.name AS type, COUNT(o.id) AS count, IFNULL(SUM(${REVENUE_AMOUNT_EXPR}), 0) AS amount
         FROM orders o
         LEFT JOIN services s ON o.service_id = s.id
         LEFT JOIN service_types st ON s.type_id = st.id
         WHERE ${REVENUE_STATUS_WHERE} AND DATE(o.created_at) BETWEEN ? AND ?
         GROUP BY st.id, st.name ORDER BY amount DESC`,
        [start, end]
      );

      const orders = await db.query(`
        SELECT o.order_no, o.created_at, o.total_price, o.status, o.discount_amount, o.promotion_discount,
               s.name as service_name, u.nickname as user_name, p.nickname as provider_name
        FROM orders o
        LEFT JOIN services s ON o.service_id = s.id
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN service_providers p ON o.provider_id = p.id
        WHERE DATE(o.created_at) BETWEEN ? AND ?
        ORDER BY o.created_at DESC
      `, [start, end]);

      const statusMap = { 0: '待支付', 1: '待接单', 2: '待服务', 3: '服务中', 4: '已完成', 5: '已取消', 6: '退费中', 7: '已退费' };
      const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

      const lines = [];
      lines.push('陪伴服务统计报表');
      lines.push(`统计区间,${start},至,${end}`);
      lines.push(`导出时间,${new Date().toISOString().replace('T', ' ').slice(0, 19)}`);
      lines.push('');
      lines.push('概览指标,数值');
      lines.push(`总营收(元),${parseFloat(revenueResult[0]?.total || 0).toFixed(2)}`);
      lines.push(`总订单数,${orderResult[0]?.count || 0}`);
      lines.push(`新增用户数,${userResult[0]?.count || 0}`);
      lines.push(`退费相关订单,${refundResult[0]?.count || 0}`);
      lines.push('');
      lines.push('销售分类,订单数,销售额(元)');
      salesRows.forEach((row) => {
        lines.push(`${escape(row.type || '其他')},${row.count || 0},${parseFloat(row.amount || 0).toFixed(2)}`);
      });
      lines.push('');
      lines.push('订单号,下单时间,服务名称,用户,服务人员,订单金额,优惠抵扣,限时折扣,状态');
      orders.forEach((o) => {
        const created = o.created_at instanceof Date
          ? o.created_at.toISOString().replace('T', ' ').slice(0, 19)
          : String(o.created_at || '');
        lines.push([
          escape(o.order_no),
          escape(created),
          escape(o.service_name),
          escape(o.user_name),
          escape(o.provider_name),
          parseFloat(o.total_price || 0).toFixed(2),
          parseFloat(o.discount_amount || 0).toFixed(2),
          parseFloat(o.promotion_discount || 0).toFixed(2),
          escape(statusMap[o.status] || o.status)
        ].join(','));
      });

      const exportDir = path.join(__dirname, '../uploads/exports');
      fs.mkdirSync(exportDir, { recursive: true });
      const fileName = `statistics_${start}_${end}_${Date.now()}.csv`;
      const filePath = path.join(exportDir, fileName);
      fs.writeFileSync(filePath, `\uFEFF${lines.join('\n')}`, 'utf8');

      res.json({
        code: 0,
        data: {
          fileName,
          downloadUrl: `/api/uploads/exports/${fileName}`,
          rowCount: orders.length
        },
        message: '报表已生成'
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = AdminStatisticsController;
