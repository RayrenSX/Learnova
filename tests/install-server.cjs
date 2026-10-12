const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const script = path.join(__dirname, '..', '学习助手完整版.user.js');
http.createServer((req, res) => {
  if (req.url === '/helper.user.js' || req.url === '/playback.user.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(req.url === '/playback.user.js' ? path.join(__dirname, '..', '学习通学习助手.user.js') : script));
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>学习助手安装</title><h1>学习通学习助手</h1><p><a href="/helper.user.js">安装或更新油猴脚本</a></p>');
  } else { res.writeHead(404); res.end(); }
}).listen(18765, '127.0.0.1', () => console.log('Local installer: http://127.0.0.1:18765/helper.user.js'));
