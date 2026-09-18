const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const databasePath = process.env.SQLITE_PATH ?? path.join(__dirname, 'boris.sqlite');
const database = new DatabaseSync(databasePath);

const WALK_SLOT_TIMES = ['09:00', '11:00', '13:00', '15:00', '17:00'];

function getCurrentLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

database.exec(`
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

const insertWalkSlot = database.prepare(`
  INSERT OR IGNORE INTO walk_slots (walk_date, slot_time, booked_by, booked_at)
  VALUES (?, ?, NULL, NULL)
`);
const currentDate = getCurrentLocalDate();

database.exec('BEGIN');

try {
  for (const slotTime of WALK_SLOT_TIMES) {
    insertWalkSlot.run(currentDate, slotTime);
  }

  database.exec('COMMIT');
} catch (error) {
  database.exec('ROLLBACK');
  throw error;
}

const selectWalkSlotsByDate = database.prepare(`
  SELECT id, walk_date, slot_time, booked_by, booked_at
  FROM walk_slots
  WHERE walk_date = ?
  ORDER BY slot_time
`);
const bookFreeWalkSlot = database.prepare(`
  UPDATE walk_slots
  SET booked_by = ?, booked_at = ?
  WHERE walk_date = ?
    AND slot_time = ?
    AND booked_by IS NULL
    AND booked_at IS NULL
`);
const insertFeeding = database.prepare(`
  INSERT INTO feedings (employee_name, fed_at)
  VALUES (?, ?)
`);
const selectLatestFeeding = database.prepare(`
  SELECT id, employee_name, fed_at
  FROM feedings
  ORDER BY fed_at DESC, id DESC
  LIMIT 1
`);

function getWalkSlotsForDate(walkDate) {
  return selectWalkSlotsByDate.all(walkDate);
}

function bookWalkSlot(walkDate, slotTime, employeeName) {
  const result = bookFreeWalkSlot.run(
    employeeName,
    new Date().toISOString(),
    walkDate,
    slotTime,
  );

  return result.changes === 1;
}

function addFeeding(employeeName) {
  insertFeeding.run(employeeName, new Date().toISOString());
}

function getLatestFeeding() {
  return selectLatestFeeding.get() ?? null;
}

module.exports = {
  addFeeding,
  bookWalkSlot,
  currentDate,
  database,
  databasePath,
  getLatestFeeding,
  getWalkSlotsForDate,
};
