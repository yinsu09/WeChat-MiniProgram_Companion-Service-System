function mapStatusFilter(status) {
  const map = {
    pending: 'provider_id IS NULL',
    assigned: 'o.provider_id IS NOT NULL AND o.status IN (1, 2)',
    in_progress: 'o.status = 3',
    completed: 'o.status = 4',
    canceled: 'o.status = 5',
    refunding: 'o.status = 6',
    refunded: 'o.status = 7'
  };
  return map[status] || null;
}

function mapDisplayStatus(order) {
  const s = Number(order.status);
  if (s === 6) return 'refunding';
  if (s === 7) return 'refunded';
  if (s === 5) return 'canceled';
  if (s === 4) return 'completed';
  if (s === 3) return 'in_progress';
  if (!order.provider_id) return 'pending';
  if (s === 1 || s === 2) return 'assigned';
  return 'pending';
}

function needsAssign(order) {
  const s = Number(order.status);
  return !order.provider_id && [0, 1, 2].includes(s);
}

function statusText(displayStatus) {
  const texts = {
    pending: '待指派',
    assigned: '已指派',
    in_progress: '进行中',
    completed: '已完成',
    canceled: '已取消',
    refunding: '退款中',
    refunded: '已退款'
  };
  return texts[displayStatus] || '未知';
}

module.exports = { mapStatusFilter, mapDisplayStatus, statusText, needsAssign };
