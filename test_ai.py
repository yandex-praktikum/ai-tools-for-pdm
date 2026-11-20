
import json
import sqlite3
from pathlib import Path

from ai_client import analyze_return, validate_ai_result
from database import (
    DATABASE_PATH,
    initialize_analysis_table,
    initialize_database,
    save_analysis,
    save_recommendation,
)

BASE = Path(__file__).resolve().parent


def read_json(filename):
    return json.loads(
        (BASE / "data" / filename).read_text(encoding="utf-8")
    )


cases = read_json("open-cases.json")["cases"]
orders = read_json("orders.json")["orders"]
history_records = read_json("return-history.json")["history"]

policy = (BASE / "policy" / "return-policy.md").read_text(
    encoding="utf-8"
)
category_rules = (BASE / "policy" / "category-rules.md").read_text(
    encoding="utf-8"
)

initialize_database()
initialize_analysis_table()

results = []
processed = 0

try:
    for case in cases:
        case_id = case["case_id"]

        with sqlite3.connect(DATABASE_PATH) as connection:
            confirmed = connection.execute(
                "SELECT manager_confirmed FROM decisions WHERE case_id = ?",
                (case_id,),
            ).fetchone()

            existing = connection.execute(
                "SELECT route FROM analyses WHERE case_id = ?",
                (case_id,),
            ).fetchone()

        if confirmed and confirmed[0] == 1:
            results.append((case_id, "Подтверждено менеджером", "Не изменяем"))
            continue

        if existing:
            results.append((case_id, existing[0], "Уже сохранено"))
            continue

        print(f"Анализируем {case_id}...", flush=True)

        try:
            order = next(
                item for item in orders
                if item["order_number"] == case["order_number"]
            )

            history = [
                item for item in history_records
                if item["order_number"] == case["order_number"]
            ]

            response = analyze_return(
                case, order, history, policy, category_rules
            )

            analysis = validate_ai_result(response)

            save_recommendation(case_id, analysis["route"])
            save_analysis(case_id, analysis)

            results.append((case_id, analysis["route"], "Успешно"))
            processed += 1

        except Exception as error:
            results.append((case_id, "ERROR", type(error).__name__))
            print(f"Ошибка {case_id}: {type(error).__name__}: {error}")

            if "RateLimit" in type(error).__name__:
                print("Лимит OpenRouter. Обработка остановлена.")
                break

finally:
    lines = [
        "# Результаты обработки обращений",
        "",
        "| Обращение | Маршрут ИИ | Статус |",
        "|---|---|---|",
    ]

    for case_id, route, status in results:
        lines.append(f"| {case_id} | {route} | {status} |")

    (BASE / "case-results.md").write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8",
    )

    print(f"\nНовых обработанных обращений: {processed}")
    print("Результаты сохранены в case-results.md")
