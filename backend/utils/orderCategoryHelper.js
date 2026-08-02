function mapOrderCategoryClause(category) {
  if (category === 'group') {
    return 'o.group_activity_id IS NOT NULL';
  }
  if (category === 'custom') {
    return 'IFNULL(o.is_custom, 0) = 1 AND o.group_activity_id IS NULL';
  }
  if (category === 'regular') {
    return 'IFNULL(o.is_custom, 0) = 0 AND o.group_activity_id IS NULL';
  }
  return null;
}

function getOrderCategoryLabel(order) {
  if (order.group_activity_id) return '组团游';
  if (Number(order.is_custom) === 1) return '指派服务';
  return '常规服务';
}

module.exports = {
  mapOrderCategoryClause,
  getOrderCategoryLabel
};
