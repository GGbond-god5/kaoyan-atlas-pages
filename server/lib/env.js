'use strict';
/**
 * 极简 .env 读取器：不依赖 dotenv，避免多装一个包。
 * 已存在的环境变量优先（方便在服务器上用 systemd / pm2 注入）。
 */
const fs = require('node:fs');

function loadEnv(file) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false; // 没有 .env 就完全靠系统环境变量
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return true;
}

module.exports = { loadEnv };
