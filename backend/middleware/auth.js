const jwt = require('jsonwebtoken');
const config = require('../config/server');

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.json({ code: 401, message: '未登录' });
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.userId = decoded.userId;
    req.openid = decoded.openid;
    next();
  } catch (error) {
    res.json({ code: 401, message: 'token无效' });
  }
}

module.exports = authMiddleware;
