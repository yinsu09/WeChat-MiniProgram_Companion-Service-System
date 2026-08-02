const DEFAULT_STATUS_MAP = {
  0: '待支付',
  1: '待接单',
  2: '待服务',
  3: '服务中',
  4: '已完成',
  5: '已取消',
  6: '已取消',
  7: '已取消'
};

function enrichUserOrder(order) {
  const status = Number(order.status);
  const result = order.refund_result || null;
  let statusText = DEFAULT_STATUS_MAP[status] || '未知';
  let refundHint = '';

  if (status === 6 || result === 'pending') {
    statusText = '已取消';
    refundHint = '退款审核中';
  } else if (status === 7 || result === 'approved') {
    statusText = '已取消';
    refundHint = order.refund_amount > 0 ? `退款成功 ¥${order.refund_amount}` : '退款成功';
  } else if (status === 5 && result === 'rejected') {
    statusText = '已取消';
    refundHint = '退款失败';
  } else if (status === 5) {
    statusText = '已取消';
    refundHint = '';
  }

  return {
    ...order,
    status_text: statusText,
    refund_hint: refundHint,
    is_cancelled: [5, 6, 7].includes(status)
  };
}

module.exports = {
  enrichUserOrder,
  DEFAULT_STATUS_MAP
};
