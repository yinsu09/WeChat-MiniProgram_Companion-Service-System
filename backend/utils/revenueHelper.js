/** 计入营收的订单：有效进行中/已完成，或取消但退款被拒（款项保留） */
const REVENUE_STATUS_WHERE = `(
  o.status IN (1, 2, 3, 4)
  OR (o.status = 5 AND o.refund_result = 'rejected')
)`;

/** 单条订单营收表达式（不含已退款、待退款、未支付取消） */
const REVENUE_AMOUNT_EXPR = `CASE
  WHEN o.status IN (1, 2, 3, 4) THEN IFNULL(o.paid_amount, o.total_price)
  WHEN o.status = 5 AND o.refund_result = 'rejected' THEN IFNULL(o.paid_amount, o.total_price)
  ELSE 0
END`;

function revenueSumSql(alias = 'o') {
  const a = alias;
  return `IFNULL(SUM(CASE
    WHEN ${a}.status IN (1, 2, 3, 4) THEN IFNULL(${a}.paid_amount, ${a}.total_price)
    WHEN ${a}.status = 5 AND ${a}.refund_result = 'rejected' THEN IFNULL(${a}.paid_amount, ${a}.total_price)
    ELSE 0
  END), 0)`;
}

module.exports = {
  REVENUE_STATUS_WHERE,
  REVENUE_AMOUNT_EXPR,
  revenueSumSql
};
