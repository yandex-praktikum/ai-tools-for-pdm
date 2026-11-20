import json
import sqlite3
from pathlib import Path

BASE = Path(__file__).resolve().parent
DB = BASE / "dispatcher.db"


def cell(value):
	if value is None:
		return "Не подтверждено"
	if isinstance(value, list):
		value = "; ".join(str(item) for item in value)
	return str(value).replace("|", "\\|").replace("\n", "<br>")


with sqlite3.connect(DB) as connection:
	connection.row_factory = sqlite3.Row
	rows = connection.execute("""
		SELECT
			a.case_id,
			a.route,
			a.reason,
			a.missing_information,
			a.customer_draft,
			a.manager_notes,
			d.final_decision,
			d.manager_confirmed,
			d.manager_reason,
			r.authorization_reference
		FROM analyses AS a
		LEFT JOIN decisions AS d ON d.case_id = a.case_id
		LEFT JOIN return_authorizations AS r
			ON r.case_id = a.case_id
		ORDER BY a.case_id
	""").fetchall()

lines = [
	"# Результаты обработки 16 обращений",
	"",
	"| Обращение | Маршрут ИИ | Обоснование | Недостающие сведения | Черновик клиенту | Заметки менеджеру | Итоговое решение | Причина изменения | Учебное разрешение |",
	"|---|---|---|---|---|---|---|---|---|",
]

for row in rows:
	missing = json.loads(row["missing_information"])

	final = (
		row["final_decision"]
		if row["manager_confirmed"]
		else "Ожидает решения менеджера"
	)

	values = [
		row["case_id"],
		row["route"],
		row["reason"],
		missing if missing else "Нет",
		row["customer_draft"],
		row["manager_notes"],
		final,
		row["manager_reason"] or "Нет",
		row["authorization_reference"] or "Не выдавалось",
	]

	lines.append("| " + " | ".join(cell(v) for v in values) + " |")

output = BASE / "case-results.md"
output.write_text("\n".join(lines) + "\n", encoding="utf-8")

print(f"Экспортировано обращений: {len(rows)}")
print("Таблица сохранена в case-results.md")
