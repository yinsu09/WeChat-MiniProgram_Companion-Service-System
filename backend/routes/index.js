const express = require('express');
const UserController = require('../controllers/UserController');
const { ServiceController, ProviderController: ServiceProviderController } = require('../controllers/ServiceController');
const SearchController = require('../controllers/SearchController');
const OrderController = require('../controllers/OrderController');
const ReviewController = require('../controllers/ReviewController');
const ProviderController = require('../controllers/providerController');
const AdminController = require('../controllers/adminController');
const AdminProviderController = require('../controllers/AdminProviderController');
const AdminServiceController = require('../controllers/AdminServiceController');
const AdminOrderController = require('../controllers/AdminOrderController');
const AdminRefundController = require('../controllers/AdminRefundController');
const AdminMarketingController = require('../controllers/AdminMarketingController');
const AdminStatisticsController = require('../controllers/AdminStatisticsController');
const AfterSalesController = require('../controllers/AfterSalesController');
const PointsController = require('../controllers/PointsController');
const MarketingController = require('../controllers/MarketingController');
const UploadController = require('../controllers/UploadController');

const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.post('/upload/image', authMiddleware, UploadController.uploadImage);

router.post('/user/login', UserController.login);
router.post('/user/login-by-phone', UserController.loginByPhone);
router.post('/user/login-by-password', UserController.loginByPassword);
router.post('/user/wechat-login', UserController.wechatLogin);
router.post('/user/register', UserController.register);
router.post('/user/send-code', UserController.sendCode);
router.post('/user/forgot-password', UserController.forgotPassword);
router.post('/user/bind-phone', authMiddleware, UserController.bindPhone);
router.get('/user/info', authMiddleware, UserController.getUserInfo);
router.get('/user/profile-stats', authMiddleware, UserController.getProfileStats);
router.get('/user/notifications', authMiddleware, UserController.getNotifications);
router.put('/user/notifications/read', authMiddleware, UserController.markNotificationAsRead);
router.put('/user/info', authMiddleware, UserController.updateUserInfo);

router.get('/user/points', authMiddleware, PointsController.getUserPoints);
router.get('/user/points-records', authMiddleware, PointsController.getPointsRecords);
router.get('/user/coupons', authMiddleware, PointsController.getCoupons);
router.get('/user/points-mall', authMiddleware, PointsController.getPointsMall);
router.post('/user/exchange-item', authMiddleware, PointsController.exchangeItem);
router.post('/user/exchange-coupon', authMiddleware, PointsController.exchangeCoupon);
router.post('/user/redeem-points-coupon', authMiddleware, PointsController.redeemPointsCoupon);
router.post('/user/coupons/mark-read', authMiddleware, PointsController.markCouponsRead);

router.get('/services/types/schedule/options', ServiceController.getTypeSchedule);
router.get('/services/assign-config', ServiceController.getAssignConfig);
router.get('/services/types/:typeId/available-providers', ServiceController.getAvailableProviders);
router.get('/services/types', ServiceController.getTypes);
router.get('/services/types/:typeId/providers', ServiceController.getTypeProviders);
router.get('/services/hot', ServiceController.getHotServices);
router.get('/services/recommend', ServiceController.getRecommendServices);
router.get('/services/offers', ServiceController.getOffers);
router.get('/services', ServiceController.getServices);
router.get('/services/:id/providers', ServiceController.getServiceProviders);
router.get('/services/:id', ServiceController.getServiceDetail);

router.get('/providers/recommend', ServiceProviderController.getRecommend);
router.get('/providers', ServiceProviderController.getProviders);
router.get('/providers/:id/services', ServiceProviderController.getProviderServices);
router.get('/providers/:id', ServiceProviderController.getProviderDetail);

router.get('/search/services', SearchController.searchServices);
router.get('/search/providers', SearchController.searchProviders);

router.get('/marketing/group', MarketingController.getGroupActivities);
router.get('/marketing/group/:id', MarketingController.getGroupActivity);
router.post('/marketing/group/:id/join', authMiddleware, MarketingController.joinGroupActivity);

router.post('/orders', authMiddleware, OrderController.createOrder);
router.post('/orders/custom', authMiddleware, OrderController.createCustomOrder);
router.get('/orders/checkout-coupons', authMiddleware, OrderController.getCheckoutCoupons);
router.get('/orders', authMiddleware, OrderController.getUserOrders);
router.get('/orders/:id', authMiddleware, OrderController.getOrderDetail);
router.put('/orders/:id', authMiddleware, OrderController.updateOrder);
router.post('/orders/:id/pay', authMiddleware, OrderController.payOrder);
router.put('/orders/status', authMiddleware, OrderController.updateOrderStatus);
router.post('/orders/refund', authMiddleware, OrderController.requestRefund);
router.post('/orders/:id/cancel', authMiddleware, OrderController.cancelOrder);
router.post('/orders/:id/book-next', authMiddleware, OrderController.bookNextSession);
router.post('/orders/:id/confirm-complete', authMiddleware, OrderController.confirmComplete);
router.post('/orders/:id/pause', authMiddleware, OrderController.pauseService);
router.post('/orders/:id/resume', authMiddleware, OrderController.resumeService);
router.post('/orders/after-sales', authMiddleware, AfterSalesController.create);
router.get('/orders/:orderId/after-sales', authMiddleware, AfterSalesController.getByOrder);

router.post('/reviews', authMiddleware, ReviewController.createReview);
router.get('/reviews/provider/:providerId', ReviewController.getServiceProviderReviews);
router.get('/reviews/user', authMiddleware, ReviewController.getUserReviews);
router.get('/reviews/from-provider', authMiddleware, ReviewController.getFromProviderReviews);
router.get('/reviews/order/:orderId', ReviewController.getOrderReview);

router.post('/provider/register', ProviderController.register);
router.post('/provider/send-code', ProviderController.sendCode);
router.post('/provider/login-by-password', ProviderController.loginByPassword);
router.post('/provider/login-by-phone', ProviderController.loginByPhone);
router.get('/provider/orders', authMiddleware, ProviderController.getOrders);
router.put('/provider/order/status', authMiddleware, ProviderController.updateOrderStatus);
router.get('/provider/services', authMiddleware, ProviderController.getServices);
router.put('/provider/services', authMiddleware, ProviderController.updateServices);
router.get('/provider/my-services', authMiddleware, ProviderController.getMyServices);
router.post('/provider/my-services', authMiddleware, ProviderController.createService);
router.put('/provider/my-services', authMiddleware, ProviderController.updateService);
router.put('/provider/my-services/status', authMiddleware, ProviderController.updateServiceStatus);
router.delete('/provider/my-services', authMiddleware, ProviderController.deleteService);
router.get('/provider/group-tours', authMiddleware, ProviderController.getGroupTours);
router.post('/provider/group-tours/:id/accept', authMiddleware, ProviderController.acceptGroupTour);
router.post('/provider/group-tours/:id/reject', authMiddleware, ProviderController.rejectGroupTour);
router.post('/provider/group-tours/:id/exit', authMiddleware, ProviderController.exitGroupTour);
router.get('/provider/service-types', ProviderController.getServiceTypes);
router.get('/provider/notifications', authMiddleware, ProviderController.getNotifications);
router.put('/provider/notifications/read', authMiddleware, ProviderController.markNotificationAsRead);
router.get('/provider/reviews', authMiddleware, ProviderController.getReviews);
router.post('/provider/review/user', authMiddleware, ReviewController.createProviderReview);
router.get('/provider/order/detail', authMiddleware, ProviderController.getOrderDetail);
router.get('/provider/dashboard', authMiddleware, ProviderController.getDashboard);
router.get('/provider/income', authMiddleware, ProviderController.getIncome);
router.get('/provider/price-range', authMiddleware, ProviderController.getPriceRange);
router.get('/provider/work-status', authMiddleware, ProviderController.getWorkStatus);
router.put('/provider/work-mode', authMiddleware, ProviderController.updateWorkMode);
router.post('/provider/rest-periods', authMiddleware, ProviderController.addRestPeriod);
router.delete('/provider/rest-periods/:id', authMiddleware, ProviderController.deleteRestPeriod);
router.get('/provider/profile', authMiddleware, ProviderController.getProfile);
router.put('/provider/info', authMiddleware, ProviderController.updateInfo);

router.post('/admin/login', AdminController.login);
router.get('/admin/stats', authMiddleware, AdminController.getStats);
router.get('/admin/provider-level-rules', authMiddleware, AdminController.getProviderLevelRules);
router.put('/admin/provider-level-rules', authMiddleware, AdminController.updateProviderLevelRules);
router.get('/admin/assign/rules', authMiddleware, AdminController.getAssignRules);
router.put('/admin/assign/rules', authMiddleware, AdminController.updateAssignRules);

router.get('/admin/providers', authMiddleware, AdminProviderController.getProviders);
router.get('/admin/providers/available', authMiddleware, AdminProviderController.getAvailableProviders);
router.get('/admin/providers/:id', authMiddleware, AdminProviderController.getProvider);
router.post('/admin/providers', authMiddleware, AdminProviderController.createProvider);
router.put('/admin/providers/:id', authMiddleware, AdminProviderController.updateProvider);
router.put('/admin/providers/:id/disable', authMiddleware, AdminProviderController.disableProvider);
router.put('/admin/providers/:id/enable', authMiddleware, AdminProviderController.enableProvider);
router.delete('/admin/providers/:id', authMiddleware, AdminProviderController.deleteProvider);

router.get('/admin/services', authMiddleware, AdminServiceController.getServices);
router.get('/admin/services/:id', authMiddleware, AdminServiceController.getService);
router.post('/admin/services', authMiddleware, AdminServiceController.createService);
router.put('/admin/services/:id', authMiddleware, AdminServiceController.updateService);
router.delete('/admin/services/:id', authMiddleware, AdminServiceController.deleteService);
router.put('/admin/services/:id/status', authMiddleware, AdminServiceController.updateServiceStatus);

router.get('/admin/service-types', authMiddleware, AdminServiceController.getServiceTypes);
router.get('/admin/service-types/all', authMiddleware, AdminServiceController.getAllServiceTypes);
router.get('/admin/service-types/:id', authMiddleware, AdminServiceController.getServiceType);
router.post('/admin/service-types', authMiddleware, AdminServiceController.createServiceType);
router.put('/admin/service-types/:id', authMiddleware, AdminServiceController.updateServiceType);
router.put('/admin/service-types/:id/status', authMiddleware, AdminServiceController.updateServiceTypeStatus);

router.get('/admin/orders', authMiddleware, AdminOrderController.getOrders);
router.get('/admin/orders/:id', authMiddleware, AdminOrderController.getOrder);
router.put('/admin/orders/:id/cancel', authMiddleware, AdminOrderController.cancelOrder);
router.put('/admin/orders/:id/assign', authMiddleware, AdminOrderController.assignProvider);
router.put('/admin/orders/:id/status', authMiddleware, AdminOrderController.updateOrderStatus);

router.get('/admin/refunds', authMiddleware, AdminRefundController.getRefunds);
router.get('/admin/refunds/stats', authMiddleware, AdminRefundController.getRefundStats);
router.get('/admin/refunds/rules', authMiddleware, AdminRefundController.getRefundRules);
router.put('/admin/refunds/rules', authMiddleware, AdminRefundController.updateRefundRules);
router.get('/admin/refunds/by-order/:orderId', authMiddleware, AdminRefundController.getRefundByOrder);
router.get('/admin/refunds/:id', authMiddleware, AdminRefundController.getRefund);
router.put('/admin/refunds/:id/approve', authMiddleware, AdminRefundController.approveRefund);
router.put('/admin/refunds/:id/reject', authMiddleware, AdminRefundController.rejectRefund);

router.get('/admin/after-sales', authMiddleware, AfterSalesController.list);
router.get('/admin/after-sales/:id', authMiddleware, AfterSalesController.getDetail);
router.put('/admin/after-sales/:id/approve', authMiddleware, AfterSalesController.approve);
router.put('/admin/after-sales/:id/reject', authMiddleware, AfterSalesController.reject);

router.get('/admin/marketing/stats', authMiddleware, AdminMarketingController.getStats);
router.get('/admin/marketing/active', authMiddleware, AdminMarketingController.getActiveActivities);

router.get('/admin/marketing/coupons', authMiddleware, AdminMarketingController.getCoupons);
router.get('/admin/marketing/coupons/:id', authMiddleware, AdminMarketingController.getCoupon);
router.post('/admin/marketing/coupons', authMiddleware, AdminMarketingController.createCoupon);
router.put('/admin/marketing/coupons/:id', authMiddleware, AdminMarketingController.updateCoupon);
router.delete('/admin/marketing/coupons/:id', authMiddleware, AdminMarketingController.deleteCoupon);

router.get('/admin/marketing/discounts', authMiddleware, AdminMarketingController.getDiscounts);
router.get('/admin/marketing/discounts/:id', authMiddleware, AdminMarketingController.getDiscount);
router.post('/admin/marketing/discounts', authMiddleware, AdminMarketingController.createDiscount);
router.put('/admin/marketing/discounts/:id', authMiddleware, AdminMarketingController.updateDiscount);
router.delete('/admin/marketing/discounts/:id', authMiddleware, AdminMarketingController.deleteDiscount);

router.get('/admin/marketing/newuser', authMiddleware, AdminMarketingController.getNewUserActivities);
router.get('/admin/marketing/newuser/:id', authMiddleware, AdminMarketingController.getNewUserActivity);
router.post('/admin/marketing/newuser', authMiddleware, AdminMarketingController.createNewUserActivity);
router.put('/admin/marketing/newuser/:id', authMiddleware, AdminMarketingController.updateNewUserActivity);
router.delete('/admin/marketing/newuser/:id', authMiddleware, AdminMarketingController.deleteNewUserActivity);

router.get('/admin/marketing/group', authMiddleware, AdminMarketingController.getGroupActivities);
router.get('/admin/marketing/group/:id', authMiddleware, AdminMarketingController.getGroupActivity);
router.post('/admin/marketing/group', authMiddleware, AdminMarketingController.createGroupActivity);
router.put('/admin/marketing/group/:id', authMiddleware, AdminMarketingController.updateGroupActivity);
router.post('/admin/marketing/group/:id/invite', authMiddleware, AdminMarketingController.inviteGroupProvider);
router.delete('/admin/marketing/group/:id', authMiddleware, AdminMarketingController.deleteGroupActivity);
router.post('/admin/marketing/group/:id/succeed', authMiddleware, AdminMarketingController.succeedGroupActivity);

router.get('/admin/statistics', authMiddleware, AdminStatisticsController.getStatistics);
router.get('/admin/statistics/export', authMiddleware, AdminStatisticsController.exportStatistics);
router.get('/admin/statistics/sales', authMiddleware, AdminStatisticsController.getSalesData);
router.get('/admin/statistics/hot-services', authMiddleware, AdminStatisticsController.getHotServices);
router.get('/admin/statistics/hot-providers', authMiddleware, AdminStatisticsController.getHotProviders);
router.get('/admin/statistics/user-stats', authMiddleware, AdminStatisticsController.getUserStats);
router.get('/admin/statistics/refund-stats', authMiddleware, AdminStatisticsController.getRefundStats);
router.get('/admin/statistics/level-trend', authMiddleware, AdminStatisticsController.getLevelTrend);
router.get('/admin/statistics/level-stats', authMiddleware, AdminStatisticsController.getLevelStats);

module.exports = router;