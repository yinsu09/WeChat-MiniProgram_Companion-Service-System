const db = require('./db');

function parseDiscountRatio(discountValue) {
  const value = parseFloat(discountValue) || 10;
  if (value > 0 && value <= 10) {
    return value / 10;
  }
  if (value > 10 && value <= 100) {
    return value / 100;
  }
  return 1;
}

function applyLimitedDiscount(originalPrice, discountValue) {
  const price = parseFloat(originalPrice) || 0;
  const ratio = parseDiscountRatio(discountValue);
  const finalPrice = Math.max(Number((price * ratio).toFixed(2)), 0);
  const saved = Number((price - finalPrice).toFixed(2));
  return { finalPrice, saved, ratio };
}

async function getActiveDiscountForService(serviceTypeId, serviceId) {
  const rows = await db.query(
    `SELECT * FROM discounts
     WHERE status = 1
       AND CONCAT(start_date, ' ', IFNULL(start_time, '00:00:00')) <= NOW()
       AND CONCAT(end_date, ' ', IFNULL(end_time, '23:59:59')) >= NOW()
     ORDER BY discount ASC`
  );

  const typeId = parseInt(serviceTypeId, 10);
  const sId = parseInt(serviceId, 10);

  for (const row of rows) {
    let types = [];
    try {
      types = JSON.parse(row.service_types || '[]').map(Number);
    } catch (_) {
      types = [];
    }
    if (!types.length || types.includes(typeId) || types.includes(sId)) {
      return row;
    }
  }
  return null;
}

module.exports = {
  getActiveDiscountForService,
  applyLimitedDiscount,
  parseDiscountRatio
};
