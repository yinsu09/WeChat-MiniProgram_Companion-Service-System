const Service = require('../models/Service');
const ServiceProvider = require('../models/ServiceProvider');
const { formatServiceDetail, formatServiceDetailAsync, getProvidersForService, getProvidersByTypeId } = require('../utils/serviceHelper');
const { getAvailableProvidersByType, buildTypeScheduleOptions } = require('../utils/providerAvailability');
const { getActiveDiscountForService, applyLimitedDiscount } = require('../utils/discountHelper');
const { getAssignRules } = require('../utils/assignHelper');

class ServiceController {
  static async getAssignConfig(req, res) {
    try {
      const rules = await getAssignRules();
      res.json({
        code: 0,
        data: {
          user_select_enabled: rules.user_select_enabled !== false,
          auto_assign_enabled: rules.auto_assign_enabled !== false
        }
      });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getTypes(req, res) {
    try {
      const types = await Service.getTypes();
      res.json({ code: 0, data: types });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getHotServices(req, res) {
    try {
      const { limit = 6 } = req.query;
      const services = await Service.getHot(limit);
      res.json({ code: 0, data: services });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getRecommendServices(req, res) {
    try {
      const { limit = 8 } = req.query;
      const services = await Service.getRecommend(limit);
      res.json({ code: 0, data: services });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getOffers(req, res) {
    try {
      const { status = 1 } = req.query;
      const offers = await Service.getOffers(status);
      res.json({ code: 0, data: offers });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getServices(req, res) {
    try {
      const { type_id, provider_id, page = 1, limit = 50, price_range, level } = req.query;

      if (provider_id) {
        const services = await Service.getByProvider(provider_id, type_id || null);
        return res.json({ code: 0, data: services });
      }

      const services = await Service.getAll({ type_id, level, price_range, page, limit });
      res.json({ code: 0, data: services });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getTypeProviders(req, res) {
    try {
      const { typeId } = req.params;
      const providers = await getProvidersByTypeId(typeId);
      res.json({ code: 0, data: providers });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getAvailableProviders(req, res) {
    try {
      const { typeId } = req.params;
      const { scheduled_date, scheduled_time } = req.query;
      if (!scheduled_date || !scheduled_time) {
        return res.json({ code: -1, message: '请选择预约日期和时段' });
      }
      const providers = await getAvailableProvidersByType(
        typeId,
        scheduled_date,
        scheduled_time,
        req.userId || null
      );
      res.json({ code: 0, data: providers });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getTypeSchedule(req, res) {
    try {
      res.json({ code: 0, data: buildTypeScheduleOptions() });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getServiceDetail(req, res) {
    try {
      const { id } = req.params;
      const service = await Service.getDetail(id);
      if (!service) {
        return res.json({ code: -1, message: '服务不存在' });
      }

      const activeDiscount = await getActiveDiscountForService(service.type_id, service.id);
      if (activeDiscount) {
        const basePrice = parseFloat(service.base_price) || 0;
        const applied = applyLimitedDiscount(basePrice, activeDiscount.discount);
        service.active_discount = {
          id: activeDiscount.id,
          name: activeDiscount.name,
          discount: parseFloat(activeDiscount.discount),
          discounted_price: applied.finalPrice,
          saved_amount: applied.saved
        };
        if (Array.isArray(service.purchase_options)) {
          service.purchase_options = service.purchase_options.map((option) => {
            const optionApplied = applyLimitedDiscount(option.price, activeDiscount.discount);
            return {
              ...option,
              original_price: option.price,
              price: optionApplied.finalPrice,
              discount_saved: optionApplied.saved
            };
          });
        }
      }

      res.json({ code: 0, data: service });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getServiceProviders(req, res) {
    try {
      const { id } = req.params;
      const service = await Service.getById(id);
      if (!service) {
        return res.json({ code: -1, message: '服务不存在' });
      }
      const providers = await getProvidersForService(service);
      res.json({ code: 0, data: providers });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

class ProviderController {
  static async getRecommend(req, res) {
    try {
      const { limit = 5 } = req.query;
      const providers = await ServiceProvider.getRecommend(limit);
      res.json({ code: 0, data: providers });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getProviders(req, res) {
    try {
      const { type_id, level, page = 1, limit = 10 } = req.query;
      const providers = await ServiceProvider.getAll({ type_id, level, page, limit });
      res.json({ code: 0, data: providers });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getProviderServices(req, res) {
    try {
      const { id } = req.params;
      const { type_id } = req.query;
      const services = await Service.getByProvider(id, type_id || null);
      res.json({ code: 0, data: services });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async getProviderDetail(req, res) {
    try {
      const { id } = req.params;
      const provider = await ServiceProvider.getById(id);
      if (!provider) {
        return res.json({ code: -1, message: '服务人员不存在' });
      }
      res.json({ code: 0, data: provider });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = { ServiceController, ProviderController };