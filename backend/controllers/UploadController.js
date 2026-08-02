const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

class UploadController {
  static async uploadImage(req, res) {
    try {
      const { base64 } = req.body;
      if (!base64) {
        return res.json({ code: -1, message: '缺少图片数据' });
      }

      const matches = base64.match(/^data:image\/(\w+);base64,(.+)$/);
      const ext = matches ? matches[1] : 'jpg';
      const data = matches ? matches[2] : base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(data, 'base64');

      if (buffer.length > 5 * 1024 * 1024) {
        return res.json({ code: -1, message: '图片大小不能超过5MB' });
      }

      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, buffer);

      const host = req.get('host');
      const protocol = req.protocol;
      const url = `${protocol}://${host}/api/uploads/${filename}`;

      res.json({ code: 0, data: { url, filename } });
    } catch (error) {
      res.json({ code: -1, message: error.message });
    }
  }
}

module.exports = UploadController;
