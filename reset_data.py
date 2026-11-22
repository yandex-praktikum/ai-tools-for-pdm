
import json
import sqlite3
from pathlib import Path

from database import (
    DATABASE_PATH,
    initialize_database,
    initialize_analysis_table,
    add_manager_reason_column,
)
from decision_rules import validate_route

ROOT = Path(__file__).resolve().parent
SEED_PATH = ROOT / "data" / "seed-analyses.json"


def reset_start_data():
    if not SEED_PATH.exists():
        raise FileNotFoundError(
            "Не найден файл data/seed-analyses.json"
        )

    analyses = json.loads(
        SEED_PATH.read_text(encoding="utf-8")
    )

    if (
        not isinstance(analyses, list)
        or len(analyses) != 16
        or len({item["case_id"] for item in analyses}) != 16
    ):
        raise ValueError(
            "Стартовые данные должны содержать 16 разных обращений"
        )

    expected_ids = {
        f"RC-{number}" for number in range(6001, 6017)
    }

    if {item["case_id"] for item in analyses} != expected_ids:
        raise ValueError(
            "Список стартовых обращений не соответствует RC-6001–RC-6016"
        )

    for item in analyses:
        validate_route(item["route"])

    initialize_database()
    initialize_analysis_table()
    add_manager_reason_column()

    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("BEGIN IMMEDIATE")

        connection.execute("""
            CREATE TABLE IF NOT EXISTS return_authorizations (
                case_id TEXT PRIMARY KEY,
                authorization_reference TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        connection.execute("DELETE FROM return_authorizations")

        connection.execute("""
            CREATE TABLE IF NOT EXISTS event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        connection.execute("DELETE FROM event_log")

        connection.execute("DELETE FROM analyses")
        connection.execute("DELETE FROM decisions")

       
                    
        for item in analyses:
            connection.execute(
                """
                INSERT INTO analyses (
                    case_id,
                    route,
                    reason,
                    missing_information,
                    customer_draft,
                    manager_notes
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    item["case_id"],
                    item["route"],
                    item["reason"],
                    json.dumps(
                        item["missing_information"],
                        ensure_ascii=False,
                    ),
                    item["customer_draft"],
                    item["manager_notes"],
                ),
            )

            connection.execute(
                """
                INSERT INTO decisions (
                    case_id,
                    recommended_route,
                    final_decision,
                    manager_confirmed
                )
                VALUES (?, ?, NULL, 0)
                """,
                (item["case_id"], item["route"]),
            )

            connection.execute(
                """
                INSERT INTO event_log (
                    case_id, event_type, details
                )
                VALUES (?, ?, ?)
                """,
                (
                    item["case_id"],
                    "ROUTE_SELECTED",
                    (
                        f"Маршрут: {item['route']}; "
                        "источники: open-cases.json, orders.json, "
                        "return-history.json, return-policy.md, "
                        "category-rules.md; "
                        "анализ восстановлен из seed-analyses.json"
                    ),
                ),
            )

            event_by_route = {
                "DUPLICATE_OR_PROCESSED": "DUPLICATE_DETECTED",
                "MANUAL_REVIEW": "MANUAL_REVIEW_REQUIRED",
                "NEED_MORE_INFORMATION": "MORE_INFORMATION_REQUIRED",
            }

            event_type = event_by_route.get(item["route"])

            if event_type:
                connection.execute(
                    """
                    INSERT INTO event_log (
                        case_id, event_type, details
                    )
                    VALUES (?, ?, ?)
                    """,
                    (
                        item["case_id"],
                        event_type,
                        f"Требуется обработка маршрута {item['route']}",
                    ),
                )


    print(
        "Стартовые данные восстановлены: 16 анализов. "
        "Решения менеджера ожидают подтверждения."
    )


if __name__ == "__main__":
    reset_start_data()



