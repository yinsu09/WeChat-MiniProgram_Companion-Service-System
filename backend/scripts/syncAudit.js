const fs = require('fs');
const path = require('path');
const { mapDisplayStatus, statusText } = require('../utils/orderStatusHelper');

const LOG = path.join(__dirname, '../../debug-5c0501.log');

function log(hypothesisId, message, data) {
  const line = JSON.stringify({
    sessionId: '5c0501',
    hypothesisId,
    location: 'syncAudit.js',
    message,
    data,
    timestamp: Date.now(),
    runId: process.env.RUN_ID || 'audit-pre'
  });
  fs.appendFileSync(LOG, `${line}\n`);
}

(async () => {
  // H1: display_status for refund orders
  for (const status of [5, 6, 7]) {
    const order = { status, provider_id: 1 };
    const display = mapDisplayStatus(order);
    log('H1', 'mapDisplayStatus result', {
      rawStatus: status,
      display_status: display,
      status_text: statusText(display),
      refundButtonVisible: display === 'refunding'
    });
  }

  // H4: rejectRefund coupon restore (static check)
  const Order = require('../models/Order');
  log('H4', 'rejectRefund source check', {
    hasRestoreCouponCall: /restoreOrderCoupon/.test(Order.rejectRefund.toString())
  });

  const AdminRefundController = require('../controllers/AdminRefundController');
  log('H5', 'approveRefund source check', {
    readsActualAmountFromBody: /actual_amount/.test(AdminRefundController.approveRefund.toString())
  });

  // H1 API shape: admin orders with status=6
  const db = require('../utils/db');
  const rows = await db.query('SELECT id, status FROM orders WHERE status = 6 LIMIT 3');
  rows.forEach((row) => {
    const display = mapDisplayStatus(row);
    log('H1', 'DB order display_status', {
      orderId: row.id,
      rawStatus: row.status,
      display_status: display,
      refundButtonWouldShow: display === 'refunding'
    });
  });

  process.exit(0);
})().catch((err) => {
  log('ERR', 'audit failed', { error: err.message });
  process.exit(1);
});
