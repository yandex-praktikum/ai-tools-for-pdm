// SQLite: схема из spec.md, автосоздание пяти слотов на текущую дату.
// Драйвер — встроенный node:sqlite (внешних зависимостей нет).

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'boris.db');
const SLOT_TIMES = ['09:00', '11:00', '13:00', '15:00', '17:00'];

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

// Схема из spec.md, дословно
db.exec(`
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

// Локальная дата в формате YYYY-MM-DD (без сдвига часовых поясов)
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Пять слотов на дату, если их ещё нет (UNIQUE защищает от дублей)
function ensureSlots(date) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO walk_slots (walk_date, slot_time) VALUES (?, ?)'
  );
  for (const t of SLOT_TIMES) insert.run(date, t);
}

function getSlots(date = today()) {
  ensureSlots(date);
  return db
    .prepare(
      'SELECT slot_time, booked_by FROM walk_slots WHERE walk_date = ? ORDER BY slot_time'
    )
    .all(date);
}

// Атомарная запись в слот: один UPDATE меняет только свободный слот.
// Если changes === 0, слот уже занят (или не найден) — конкурентная
// запись невозможна, первоначальное ФИО сохраняется.
function bookSlot(slotTime, name, date = today()) {
  const result = db
    .prepare(
      `UPDATE walk_slots
       SET booked_by = ?, booked_at = ?
       WHERE walk_date = ? AND slot_time = ? AND booked_by IS NULL`
    )
    .run(name, new Date().toISOString(), date, slotTime);
  return result.changes > 0;
}

// Кормление: новая отметка и последняя по времени запись
function addFeeding(name) {
  db.prepare('INSERT INTO feedings (employee_name, fed_at) VALUES (?, ?)').run(
    name,
    new Date().toISOString()
  );
}

function getLastFeeding() {
  return db
    .prepare(
      'SELECT employee_name, fed_at FROM feedings ORDER BY id DESC LIMIT 1'
    )
    .get();
}

module.exports = { getSlots, bookSlot, SLOT_TIMES, addFeeding, getLastFeeding };
