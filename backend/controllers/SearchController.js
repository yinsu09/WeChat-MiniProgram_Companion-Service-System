const Service = require('../models/Service');
const ServiceProvider = require('../models/ServiceProvider');

class SearchController {
  static async searchServices(req, res) {
    try {
      const { keyword, type_id, price_range, level, limit = 20 } = req.query;
      
      let services = await Service.search({
        keyword,
        type_id,
        price_range,
        level,
        limit
      });

      res.json({ code: 0, data: { services: Array.isArray(services) ? services : [] } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }

  static async searchProviders(req, res) {
    try {
      const { keyword, type_id, level, limit = 20 } = req.query;
      
      let providers = await ServiceProvider.search({
        keyword,
        type_id,
        level,
        limit
      });

      res.json({ code: 0, data: { providers: Array.isArray(providers) ? providers : [] } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = SearchController;
