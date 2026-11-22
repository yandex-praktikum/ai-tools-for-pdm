from pathlib import Path
import json
from flask import Flask, jsonify, request, render_template
from decision_rules import validate_route

from auth import is_authorized_manager
from database import (
    confirm_manager_decision,
    
    save_recommendation,
    save_analysis,
    record_event,
    get_case_events,
)
app = Flask(__name__)
app.json.ensure_ascii = False

@app.get("/")
def index():
    return render_template("index.html")

PROJECT_ROOT = Path(__file__).resolve().parent

def load_data(filename):
    path = PROJECT_ROOT / "data" / filename
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)

def load_policy(filename):
    path = PROJECT_ROOT / "policy" / filename
    with open(path, "r", encoding="utf-8") as file:
        return file.read()


@app.get("/api/policy")
def get_policy():
    return jsonify({
        "return_policy": load_policy("return-policy.md"),
        "category_rules": load_policy("category-rules.md"),
    })

@app.post("/api/validate-route")
def validate_route_endpoint():
    from flask import request

    data = request.get_json(silent=True) or {}
    route = data.get("route")

    try:
        validated_route = validate_route(route)
    except (ValueError, TypeError):
        return jsonify({
            "error": "Недопустимый маршрут обработки"
        }), 400

    return jsonify({
        "route": validated_route,
        "valid": True,
        "final_decision": None,
        "manager_confirmation_required": True,
    })

@app.post("/api/manager/check")
def check_manager():
    provided_key = request.headers.get("X-Manager-Key")

    if not is_authorized_manager(provided_key):
        return jsonify({
            "authorized": False,
            "error": "Доступ запрещён"
        }), 403

    return jsonify({
        "authorized": True,
        "role": "manager"
    })


@app.post("/api/manager/confirm")
def confirm_decision_endpoint():
    provided_key = request.headers.get("X-Manager-Key")

    if not is_authorized_manager(provided_key):
        return jsonify({"error": "Доступ запрещён"}), 403

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Неверный формат запроса"}), 400

    case_id = data.get("case_id")
    final_decision = data.get("final_decision")
    manager_reason = data.get("manager_reason")
    
    if not isinstance(case_id, str) or not case_id:
        return jsonify({"error": "Укажите номер обращения"}), 400

    if final_decision not in ("APPROVED", "DENIED"):
        return jsonify({"error": "Недопустимое решение"}), 400

 
    try:
        confirmed = confirm_manager_decision(
            case_id, final_decision, manager_reason
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 409

    if not confirmed:
        return jsonify({"error": "Решение не сохранено"}), 409

    record_event(
        case_id,
        "MANAGER_CONFIRMED",
        f"Итоговое решение: {final_decision}",
    )

    if final_decision == "DENIED":
        record_event(
            case_id,
            "RETURN_DENIED",
            "Менеджер подтвердил отказ",
        )

    if final_decision == "APPROVED":
        import sqlite3
        from database import DATABASE_PATH

        with sqlite3.connect(DATABASE_PATH) as connection:
            authorization = connection.execute(
                """
                SELECT authorization_reference
                FROM return_authorizations
                WHERE case_id = ?
                """,
                (case_id,),
            ).fetchone()

        if authorization:
            record_event(
                case_id,
                "AUTHORIZATION_ISSUED",
                f"Учебное разрешение: {authorization[0]}",
            )

    return jsonify({
        "case_id": case_id,
        "final_decision": final_decision,
        "manager_confirmed": True,
        "manager_reason": manager_reason,
    })





@app.get("/api/cases")
def get_cases():
    data = load_data("open-cases.json")
    return jsonify(data)

@app.get("/api/cases/<case_id>")
def get_case_details(case_id):
    cases_data = load_data("open-cases.json")
    orders_data = load_data("orders.json")
    history_data = load_data("return-history.json")
    case = next(
        (item for item in cases_data["cases"]
         if item["case_id"] == case_id),
        None,
    )

    if case is None:
        return jsonify({"error": "Обращение не найдено"}), 404

    order = next(
        (item for item in orders_data["orders"]
         if item["order_number"] == case["order_number"]),
        None,
    )

   
    history = [
        item
        for item in history_data["history"]
        if item["order_number"] == case["order_number"]
    ]


    import sqlite3
    from database import DATABASE_PATH

    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row

        analysis_row = connection.execute(
            "SELECT * FROM analyses WHERE case_id = ?",
            (case_id,),
        ).fetchone()

        decision_row = connection.execute(
            "SELECT * FROM decisions WHERE case_id = ?",
            (case_id,),
        ).fetchone()

    analysis = None

    if analysis_row:
        analysis = dict(analysis_row)
        analysis["missing_information"] = json.loads(
            analysis["missing_information"]
        )

    decision = dict(decision_row) if decision_row else None

    return jsonify({
        "case": case,
        "order": order,
        "history": history,
        "analysis": analysis,
        "decision": decision,
        "events": get_case_events(case_id),
    })







@app.post("/api/cases/<case_id>/analyze")
def analyze_case_endpoint(case_id):
    from ai_client import analyze_return, validate_ai_result

    provided_key = request.headers.get("X-Manager-Key")

    if not is_authorized_manager(provided_key):
        return jsonify({"error": "Доступ запрещён"}), 403

    cases = load_data("open-cases.json")["cases"]
    orders = load_data("orders.json")["orders"]
    history_records = load_data("return-history.json")["history"]

    case = next(
        (item for item in cases if item["case_id"] == case_id),
        None,
    )

    if case is None:
        return jsonify({"error": "Обращение не найдено"}), 404

    order = next(
        (
            item for item in orders
            if item["order_number"] == case["order_number"]
        ),
        None,
    )

    if order is None:
        return jsonify({"error": "Заказ не найден"}), 404

    history = [
        item for item in history_records
        if item["order_number"] == case["order_number"]
    ]

    try:
        raw_result = analyze_return(
            case,
            order,
            history,
            load_policy("return-policy.md"),
            load_policy("category-rules.md"),
        )

        result = validate_ai_result(raw_result)
        save_recommendation(case_id, result["route"])
        save_analysis(case_id, result)

        record_event(
            case_id,
            "ROUTE_SELECTED",
            (
                f"Маршрут: {result['route']}; "
                "источники: open-cases.json, orders.json, "
                "return-history.json, return-policy.md, "
                "category-rules.md"
            ),
        )

        event_by_route = {
            "DUPLICATE_OR_PROCESSED": "DUPLICATE_DETECTED",
            "MANUAL_REVIEW": "MANUAL_REVIEW_REQUIRED",
            "NEED_MORE_INFORMATION": "MORE_INFORMATION_REQUIRED",
        }

        event_type = event_by_route.get(result["route"])

        if event_type:
            record_event(
                case_id,
                event_type,
                f"Обработка остановлена на маршруте {result['route']}",
            )

    except Exception:
        app.logger.exception("Ошибка анализа обращения %s", case_id)
        return jsonify({
            "error": "Не удалось получить корректный ответ ИИ"
        }), 502

    return jsonify({
        "case_id": case_id,
        "analysis": result,
        "manager_confirmed": False,
        "final_decision": None,
    })
@app.get("/api/health")
def health():
	return jsonify({
		"status": "ok",
		"service": "return-dispatcher"
	})


if __name__ == "__main__":
	app.run(debug=True, port=5000)

