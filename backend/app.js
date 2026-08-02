const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const config = require('./config/server');
const { ensureServiceColumns } = require('./utils/serviceHelper');
const { ensureSchema } = require('./utils/ensureSchema');

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', routes);

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('全局错误:', err);
  res.status(500).json({ code: -1, message: '服务器内部错误' });
});

app.listen(config.port, '0.0.0.0', async () => {
  try {
    await ensureServiceColumns();
    await ensureSchema();
  } catch (error) {
    console.error('服务表字段迁移失败:', error.message);
  }
  console.log(`Server running on http://0.0.0.0:${config.port}`);
});

// 捕获未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});

// 捕获未捕获的异常
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
  process.exit(1);
});