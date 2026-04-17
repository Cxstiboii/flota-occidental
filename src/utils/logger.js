const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function write(level, msg) {
  ensureDir();
  const now = new Date();
  const line = `[${now.toISOString()}] [${level}] ${msg}\n`;
  const file = path.join(LOG_DIR, `${now.toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(file, line);
  console.log(line.trim());
}

module.exports = {
  info:  (msg) => write('INFO ', msg),
  warn:  (msg) => write('WARN ', msg),
  error: (msg) => write('ERROR', msg),
};
