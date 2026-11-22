import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { renderPage } from './page.mjs';

const slots = ['09:00', '11:00', '13:00', '15:00', '17:00'];
const timeZone = 'Europe/Moscow';
const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' });
const displayDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const feedingTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone, dateStyle: 'long', timeStyle: 'short',
});

const databasePath = resolve(process.env.DB_PATH || 'data/boris.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA busy_timeout = 3000;
  CREATE TABLE IF NOT EXISTS walk_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    walk_date TEXT NOT NULL,
    slot_time TEXT NOT NULL,
    booked_by TEXT,
    booked_at TEXT,
    UNIQUE (walk_date, slot_time),
    CHECK (
      (booked_by IS NULL AND booked_at IS NULL)
      OR
      (booked_by IS NOT NULL AND booked_at IS NOT NULL)
    )
  );
  CREATE TABLE IF NOT EXISTS feedings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_name TEXT NOT NULL,
    fed_at TEXT NOT NULL
  );
`);

// Keep the original data from databases created by the project prototype.
database.exec('BEGIN IMMEDIATE');
try {
  if (database.prepare('PRAGMA user_version').get().user_version === 0) {
    const hasTable = database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?");
    if (hasTable.get('walk_bookings')) {
      database.prepare(`
        INSERT INTO walk_slots (walk_date, slot_time, booked_by, booked_at)
        SELECT walk_date, slot, full_name, '' FROM walk_bookings
        WHERE slot IN (${slots.map(() => '?').join(', ')})
        ON CONFLICT (walk_date, slot_time) DO NOTHING;
      `).run(...slots);
    }
    if (hasTable.get('last_feeding')) {
      database.exec(`
        INSERT INTO feedings (employee_name, fed_at)
        SELECT 'Имя не было указано', fed_at FROM last_feeding WHERE id = 1;
      `);
    }
    database.exec('PRAGMA user_version = 1');
  }
  database.exec('COMMIT');
} catch (error) {
  database.exec('ROLLBACK');
  throw error;
}

const createSlots = database.prepare(`
  INSERT INTO walk_slots (walk_date, slot_time)
  VALUES ${slots.map(() => '(?, ?)').join(', ')}
  ON CONFLICT (walk_date, slot_time) DO NOTHING
`);
const getBookings = database.prepare('SELECT slot_time, booked_by FROM walk_slots WHERE walk_date = ?');
const saveBooking = database.prepare(`
  UPDATE walk_slots
  SET booked_by = ?, booked_at = ?
  WHERE walk_date = ? AND slot_time = ? AND booked_by IS NULL
`);
const getFeeding = database.prepare('SELECT employee_name, fed_at FROM feedings ORDER BY fed_at DESC, id DESC LIMIT 1');
const saveFeeding = database.prepare('INSERT INTO feedings (employee_name, fed_at) VALUES (?, ?)');
const assets = new Map([
  ['/styles.css', ['text/css; charset=utf-8', readFileSync(new URL('./public/styles.css', import.meta.url))]],
  ['/page.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/page.js', import.meta.url))]],
]);

function ensureSlots(day) {
  createSlots.run(...slots.flatMap((slot) => [day, slot]));
}

function showPage(response, { now = new Date(), status = 200, notice, result } = {}) {
  const day = dateKey.format(now);
  ensureSlots(day);
  const bookings = new Map(getBookings.all(day).map(({ slot_time, booked_by }) => [slot_time, booked_by]));
  const feeding = getFeeding.get();
  const bookedSlot = result?.get('booked');
  if (bookings.get(bookedSlot)) {
    notice = { message: `Запись на ${bookedSlot} сохранена.` };
  } else if (result?.has('fed') && feeding) {
    notice = { area: 'feeding', message: 'Кормление отмечено.' };
  }
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(renderPage({
    day, dateLabel: displayDate.format(now), slots, bookings, feeding,
    feedingLabel: feeding && feedingTime.format(new Date(feeding.fed_at)), notice,
  }));
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 8192) {
      request.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function redirect(response, location) {
  response.writeHead(303, { Location: location }).end();
}

function submittedName(form) {
  return (form.get('fullName') ?? '').trim().replace(/\s+/gu, ' ');
}

async function bookWalk(request, response) {
  const form = await readForm(request);
  const now = new Date();
  const reject = (status, message) => showPage(response, {
    now, status, notice: { error: true, message },
  });

  if (!form) {
    reject(413, 'Форма слишком большая. Введите ФИО длиной до 120 символов.');
    return;
  }

  const date = dateKey.format(now);
  const slot = form.get('slot');
  const fullName = submittedName(form);
  if (!slots.includes(slot)) {
    reject(400, 'Выберите один из пяти доступных слотов.');
    return;
  }
  if (form.get('date') !== date) {
    reject(409, 'Дата изменилась. Выберите свободный слот на сегодня.');
    return;
  }
  if (!fullName || fullName.length > 120) {
    reject(400, 'Введите ФИО длиной от 1 до 120 символов.');
    return;
  }
  ensureSlots(date);
  if (saveBooking.run(fullName, now.toISOString(), date, slot).changes === 0) {
    reject(409, `Слот на ${slot} уже занят. Выберите другое время.`);
    return;
  }

  redirect(response, `/?booked=${encodeURIComponent(slot)}`);
}

async function recordFeeding(request, response) {
  const form = await readForm(request);
  const fullName = form && submittedName(form);
  if (!fullName || fullName.length > 120) {
    showPage(response, {
      status: form ? 400 : 413,
      notice: { area: 'feeding', error: true, message: 'Введите ФИО длиной от 1 до 120 символов.' },
    });
    return;
  }

  saveFeeding.run(fullName, new Date().toISOString());
  redirect(response, '/?fed=1#feeding');
}

async function handle(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  const { pathname, searchParams } = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && pathname === '/') {
    showPage(response, { result: searchParams });
    return;
  }
  if (request.method === 'GET' && assets.has(pathname)) {
    const [type, body] = assets.get(pathname);
    response.writeHead(200, { 'Content-Type': type }).end(body);
    return;
  }
  if (request.method === 'POST' && pathname === '/feeding') {
    await recordFeeding(request, response);
    return;
  }
  if (request.method === 'POST' && pathname === '/bookings') {
    await bookWalk(request, response);
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Страница не найдена.');
}

export const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error.message);
    if (!response.headersSent) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    response.end('Не удалось обработать запрос. Попробуйте ещё раз.');
  });
});

if (import.meta.main) {
  const host = process.env.HOST || '127.0.0.1';
  server.listen(Number(process.env.PORT ?? 3000), host, () => {
    console.log(`Борис ждёт на http://${host}:${server.address().port}`);
  });
}
