const { DatabaseSync } = require('node:sqlite');
const { join } = require('node:path');

const database = new DatabaseSync(join(__dirname, 'boris.sqlite'));
const walkSlotTimes = ['09:00', '11:00', '13:00', '15:00', '17:00'];

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

function getCurrentDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getWalkSlotsForCurrentDate() {
  const walkDate = getCurrentDate();
  ensureSlotsForDate(walkDate);

  const placeholders = walkSlotTimes.map(() => '?').join(', ');
  const rows = database.prepare(`
    SELECT slot_time, booked_by
    FROM walk_slots
    WHERE walk_date = ? AND slot_time IN (${placeholders})
    ORDER BY slot_time
  `).all(walkDate, ...walkSlotTimes);
  const slotsByTime = new Map(rows.map(row => [row.slot_time, row.booked_by]));

  return {
    walkDate,
    slots: walkSlotTimes.map(slotTime => ({
      slotTime,
      bookedBy: slotsByTime.get(slotTime) ?? null
    }))
  };
}

function ensureSlotsForDate(walkDate) {
  const insertSlot = database.prepare(`
    INSERT OR IGNORE INTO walk_slots (walk_date, slot_time)
    VALUES (?, ?)
  `);

  for (const slotTime of walkSlotTimes) {
    insertSlot.run(walkDate, slotTime);
  }
}

function bookWalkSlot(slotTime, employeeName) {
  if (typeof slotTime !== 'string' || !walkSlotTimes.includes(slotTime)) {
    return { error: 'Выберите один из доступных слотов.' };
  }

  if (typeof employeeName !== 'string') {
    return { error: 'Введите ФИО сотрудника.' };
  }

  const normalizedName = employeeName.trim().replace(/\s+/g, ' ');
  if (!normalizedName) {
    return { error: 'Введите ФИО сотрудника.' };
  }

  const walkDate = getCurrentDate();
  ensureSlotsForDate(walkDate);
  const result = database.prepare(`
    UPDATE walk_slots
    SET booked_by = ?, booked_at = ?
    WHERE walk_date = ?
      AND slot_time = ?
      AND booked_by IS NULL
      AND booked_at IS NULL
  `).run(normalizedName, new Date().toISOString(), walkDate, slotTime);
  const currentState = getWalkSlotsForCurrentDate();

  return {
    outcome: result.changes === 1 ? 'booked' : 'conflict',
    ...currentState
  };
}

function getLatestFeeding() {
  return database.prepare(`
    SELECT employee_name AS employeeName, fed_at AS fedAt
    FROM feedings
    ORDER BY id DESC
    LIMIT 1
  `).get() ?? null;
}

function addFeeding(employeeName) {
  if (typeof employeeName !== 'string') {
    return { error: 'Введите ФИО сотрудника.' };
  }

  const normalizedName = employeeName.trim().replace(/\s+/g, ' ');
  if (!normalizedName) {
    return { error: 'Введите ФИО сотрудника.' };
  }

  database.prepare(`
    INSERT INTO feedings (employee_name, fed_at)
    VALUES (?, ?)
  `).run(normalizedName, new Date().toISOString());

  return { feeding: getLatestFeeding() };
}

module.exports = { addFeeding, bookWalkSlot, getLatestFeeding, getWalkSlotsForCurrentDate };