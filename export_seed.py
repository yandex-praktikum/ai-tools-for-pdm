import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATABASE = ROOT / "dispatcher.db"
OUTPUT = ROOT / "data" / "seed-analyses.json"

with sqlite3.connect(DATABASE) as connection:
	connection.row_factory = sqlite3.Row

	analyses = [
		dict(row)
		for row in connection.execute("""
			SELECT
				case_id,
				route,
				reason,
				missing_information,
				customer_draft,
				manager_notes
			FROM analyses
			ORDER BY case_id
		""")
	]

if len(analyses) != 16:
	raise RuntimeError(
		f"Ожидалось 16 анализов, найдено {len(analyses)}"
	)

for analysis in analyses:
	analysis["missing_information"] = json.loads(
		analysis["missing_information"]
	)

OUTPUT.write_text(
	json.dumps(analyses, ensure_ascii=False, indent=2),
	encoding="utf-8",
)

print(f"Сохранено {len(analyses)} анализов в {OUTPUT}")
