import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).resolve().parent / "dispatcher.db"


def initialize_database():
	with sqlite3.connect(DATABASE_PATH) as connection:
		connection.execute("""
			CREATE TABLE IF NOT EXISTS decisions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				case_id TEXT NOT NULL UNIQUE,
				recommended_route TEXT,
				final_decision TEXT,
				manager_confirmed INTEGER NOT NULL DEFAULT 0
			)
		""")
		connection.commit()

def save_recommendation(case_id, recommended_route):
    from decision_rules import validate_route

    validate_route(recommended_route)

    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            """
            INSERT INTO decisions (
                case_id,
                recommended_route,
                final_decision,
                manager_confirmed
            )
            VALUES (?, ?, NULL, 0)
            ON CONFLICT(case_id) DO UPDATE SET
                recommended_route = excluded.recommended_route
            WHERE decisions.manager_confirmed = 0
            """,
            (case_id, recommended_route),
        )
        connection.commit()



def confirm_manager_decision(case_id, final_decision, manager_reason=None):
    allowed_pairs = {
        "RECOMMEND_APPROVE": "APPROVED",
        "RECOMMEND_DENY": "DENIED",
    }

    if final_decision not in ("APPROVED", "DENIED"):
        raise ValueError("Недопустимое решение менеджера")

    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS return_authorizations (
                case_id TEXT PRIMARY KEY,
                authorization_reference TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)


        row = connection.execute(
            """
            SELECT recommended_route, manager_confirmed
            FROM decisions
            WHERE case_id = ?
            """,
            (case_id,),
        ).fetchone()

        if row is None:
            raise ValueError("Обращение не найдено")

        recommended_route, manager_confirmed = row

        if manager_confirmed:
            raise ValueError("Решение уже подтверждено")

        expected_decision = allowed_pairs.get(recommended_route)
        is_override = expected_decision != final_decision

        if is_override and not (manager_reason or "").strip():
            raise ValueError(
                "При изменении рекомендации ИИ укажите причину"
            )

        cursor = connection.execute(
            """
            UPDATE decisions
            SET final_decision = ?,
                manager_confirmed = 1,
                manager_reason = ?
            WHERE case_id = ?
              AND manager_confirmed = 0
            """,
            (
                final_decision,
                (manager_reason or "").strip() or None,
                case_id,
            ),
        )

        
        if cursor.rowcount != 1:
            return False

        if (
            recommended_route == "RECOMMEND_APPROVE"
            and final_decision == "APPROVED"
        ):
            connection.execute(
                """
                INSERT INTO return_authorizations (
                    case_id, authorization_reference
                )
                VALUES (?, ?)
                """,
                (case_id, "TRAIN-" + case_id),
            )

        return True






def initialize_analysis_table():
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS analyses (
                case_id TEXT PRIMARY KEY,
                route TEXT NOT NULL,
                reason TEXT NOT NULL,
                missing_information TEXT NOT NULL,
                customer_draft TEXT NOT NULL,
                manager_notes TEXT NOT NULL,
                analyzed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        connection.commit()



def save_analysis(case_id, analysis):
    import json

    with sqlite3.connect(DATABASE_PATH) as connection:
    
        confirmed = connection.execute(
            """
            SELECT 1 FROM decisions
            WHERE case_id = ? AND manager_confirmed = 1
            """,
            (case_id,),
        ).fetchone()

        if confirmed:
            raise ValueError(
                "Нельзя изменить анализ после подтверждения менеджером"
            )

    
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
            ON CONFLICT(case_id) DO UPDATE SET
                route = excluded.route,
                reason = excluded.reason,
                missing_information = excluded.missing_information,
                customer_draft = excluded.customer_draft,
                manager_notes = excluded.manager_notes,
                analyzed_at = CURRENT_TIMESTAMP
            """,
            (
                case_id,
                analysis["route"],
                analysis["reason"],
                json.dumps(
                    analysis["missing_information"],
                    ensure_ascii=False,
                ),
                analysis["customer_draft"],
                analysis["manager_notes"],
            ),
        )
        connection.commit()

def add_manager_reason_column():
    with sqlite3.connect(DATABASE_PATH) as connection:
        columns = [
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(decisions)"
            ).fetchall()
        ]

        if "manager_reason" not in columns:
            connection.execute(
                "ALTER TABLE decisions ADD COLUMN manager_reason TEXT"
            )

def record_event(case_id, event_type, details=""):
    allowed_events = {
        "ROUTE_SELECTED",
        "DUPLICATE_DETECTED",
        "MANUAL_REVIEW_REQUIRED",
        "MORE_INFORMATION_REQUIRED",
        "ANALYSIS_FAILED",
        "MANAGER_CONFIRMED",
        "AUTHORIZATION_ISSUED",
        "RETURN_DENIED",
        "START_DATA_RESTORED",
    }

    if event_type not in allowed_events:
        raise ValueError("Недопустимый тип события")

    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        connection.execute(
            """
            INSERT INTO event_log (
                case_id, event_type, details
            )
            VALUES (?, ?, ?)
            """,
            (case_id, event_type, details),
        )


def get_case_events(case_id):
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row

        connection.execute("""
            CREATE TABLE IF NOT EXISTS event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        rows = connection.execute(
            """
            SELECT event_type, details, created_at
            FROM event_log
            WHERE case_id = ?
            ORDER BY id
            """,
            (case_id,),
        ).fetchall()

    return [dict(row) for row in rows]




