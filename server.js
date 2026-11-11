// Каркас: минимальный HTTP-сервер без внешних зависимостей.
// Отдаёт страницу из public/ и API слотов.

const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  getSlots,
  bookSlot,
  SLOT_TIMES,
  addFeeding,
  getLastFeeding,
} = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Раздаём из public/ только известные типы файлов
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function serveStatic(urlPath, res) {
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  const type = MIME[path.extname(filePath)];
  if (!type || !filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Не найдено');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Не найдено');
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

// POST /api/book — записаться в свободный слот.
// Решение принимает сервер атомарным UPDATE, а не браузер.
async function handleBook(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: 'Некорректный запрос' });
    return;
  }
  const slotTime = String(body.slot_time || '');
  const name = String(body.name || '').trim();

  if (!name) {
    sendJson(res, 400, { error: 'Укажите ФИО' });
    return;
  }
  if (!SLOT_TIMES.includes(slotTime)) {
    sendJson(res, 404, { error: 'Такого слота нет' });
    return;
  }
  const booked = bookSlot(slotTime, name);
  if (!booked) {
    sendJson(res, 409, { error: 'Этот слот уже занят. Выберите другой.' });
    return;
  }
  sendJson(res, 200, { slot_time: slotTime, booked_by: name });
}

// POST /api/feeding — отметить кормление по ФИО
async function handleFeeding(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: 'Некорректный запрос' });
    return;
  }
  const name = String(body.name || '').trim();
  if (!name) {
    sendJson(res, 400, { error: 'Укажите ФИО' });
    return;
  }
  addFeeding(name);
  sendJson(res, 200, getLastFeeding());
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/slots') {
    sendJson(res, 200, getSlots());
    return;
  }
  if (req.url === '/api/feeding' && req.method === 'POST') {
    handleFeeding(req, res).catch(() => {
      sendJson(res, 500, { error: 'Ошибка сервера' });
    });
    return;
  }
  if (req.url === '/api/feeding') {
    sendJson(res, 200, getLastFeeding() ?? null);
    return;
  }
  if (req.url === '/api/book' && req.method === 'POST') {
    handleBook(req, res).catch(() => {
      sendJson(res, 500, { error: 'Ошибка сервера' });
    });
    return;
  }
  serveStatic(req.url === '/' ? '/index.html' : req.url, res);
});

server.listen(PORT, () => {
  console.log(`«Кто выгуливает Бориса» запущен: http://localhost:${PORT}`);
});
