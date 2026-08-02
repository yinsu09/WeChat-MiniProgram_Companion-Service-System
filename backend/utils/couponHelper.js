function calculateDiscount(couponType, discountValue, originalPrice, minAmount = 0) {
  const price = parseFloat(originalPrice) || 0;
  const min = parseFloat(minAmount) || 0;
  if (price < min) {
    return { discount: 0, finalPrice: price, message: `未满${min}元不可用` };
  }

  const type = Number(couponType);
  const value = parseFloat(discountValue) || 0;
  let discount = 0;

  if (type === 2) {
    const ratio = value > 1 && value <= 10 ? value / 10 : value / 100;
    const finalPrice = Math.max(Number((price * ratio).toFixed(2)), 0);
    discount = Number((price - finalPrice).toFixed(2));
    return { discount, finalPrice, message: '' };
  }

  discount = Math.min(value, price);
  return {
    discount: Number(discount.toFixed(2)),
    finalPrice: Number((price - discount).toFixed(2)),
    message: ''
  };
}

module.exports = { calculateDiscount };
