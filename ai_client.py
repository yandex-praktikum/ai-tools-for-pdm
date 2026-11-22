
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parent / ".env")

MODEL_NAME = "openrouter/free"


def call_model(messages):
    api_key = os.getenv("OPENROUTER_API_KEY")

    if not api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY не найден в файле .env"
        )

    client = OpenAI(
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        timeout=30.0,
        max_retries=0,
    )

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        temperature=0.2,
        max_tokens=3000,
    )

    return response.choices[0].message.content



def analyze_return(case, order, history, policy, category_rules):
    import json

    system_prompt = """

Если правило требует конкретного подтверждения, а письмо
допускает несколько толкований, не считай факт установленным.
Например, «ярлыки сохранены» не обязательно означает,
что ярлыки остались прикреплены к одежде.
В таком случае выбирай NEED_MORE_INFORMATION,
укажи недостающий факт и задай клиенту точный вопрос.

Ты — ИИ-агент первой линии возвратов компании «Клевер Маркет».

Анализируй обращение только по переданным данным и правилам.
Не придумывай факты и не считай недостающие сведения подтверждёнными.
Проверяй срок, категорию товара и историю обращений.

ПРАВИЛО ПОВТОРНОГО ОБРАЩЕНИЯ — ПРИОРИТЕТ P-4 И C-5:

Сначала проверь историю по тому же номеру заказа
и тому же основанию возврата.

Если по этому заказу и тому же основанию уже есть
закрытое дело с возвратом или выдано разрешение
на возврат, обязательно выбирай DUPLICATE_OR_PROCESSED.

Этот маршрут имеет приоритет перед MANUAL_REVIEW
и NEED_MORE_INFORMATION, если повтор подтверждён историей.

Просьба клиента выдать новый номер разрешения
не делает обращение новым. Второе разрешение не создавай.

Если причина нового обращения отличается от предыдущей,
не считай его повторным только из-за совпадения заказа.

В обосновании укажи P-4, применимое категорийное
правило и номер ранее выданного разрешения,
если он есть в истории.

Выбери ровно один маршрут:
RECOMMEND_APPROVE
RECOMMEND_DENY
NEED_MORE_INFORMATION
MANUAL_REVIEW
DUPLICATE_OR_PROCESSED

Если не хватает обязательных сведений, выбирай
NEED_MORE_INFORMATION и запрашивай только недостающие факты.

Не принимай окончательного решения и не обещай возврат денег.
Окончательное решение принимает менеджер.

Верни только JSON с полями:
route — один из пяти маршрутов;
reason — обоснование со ссылками на пункты правил;
missing_information — список недостающих сведений;
customer_draft — черновик ответа клиенту;
manager_notes — пояснения для менеджера.

ВАЖНО: Верни строго корректный JSON.
Все названия полей и все строковые значения
должны быть заключены в двойные кавычки.
Не добавляй комментарии, Markdown или текст вне JSON.
Не используй одинарные кавычки вместо двойных.
Проверь синтаксис JSON перед ответом.
"""

    user_message = json.dumps(
        {
            "case": case,
            "order": order,
            "history": history,
            "return_policy": policy,
            "category_rules": category_rules,
        },
        ensure_ascii=False,
    )

    return call_model(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
    )


def validate_ai_result(result):
    import json

    if isinstance(result, str):
        result = result.strip()

        if result.startswith("```json"):
            result = result[7:]
        if result.endswith("```"):
            result = result[:-3]

        result = json.loads(result.strip())

    required_fields = {
        "route",
        "reason",
        "missing_information",
        "customer_draft",
        "manager_notes",
        }

    if not isinstance(result, dict):
        raise ValueError(
            f"Ответ ИИ должен быть JSON-объектом, получен тип: {type(result).__name__}"
        )

    if not required_fields.issubset(result):
        raise ValueError("В ответе ИИ отсутствуют обязательные поля")

    from decision_rules import validate_route

    validate_route(result["route"])

    if not isinstance(result["missing_information"], list):
        raise ValueError("missing_information должен быть списком")

    
    
    draft = result["customer_draft"]

    if not isinstance(draft, str):
        raise ValueError("customer_draft должен быть строкой")

    forbidden_phrases = [
        "мы оформляем возврат",
        "возврат одобрен",
        "возврат подтверждён",
        "деньги будут возвращены",
        "мы вернём деньги",
    ]

    if any(
        phrase in draft.casefold()
        for phrase in forbidden_phrases
    ):
        raise ValueError(
            "Черновик содержит обещание возврата без решения менеджера"
        )
    return result