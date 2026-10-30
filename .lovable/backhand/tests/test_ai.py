from zhauap.integrations.gemini import GeminiClient, parse_model_json
from zhauap.services.ai import build_contents, build_system_prompt, find_unknown_amounts, wants_human
from zhauap.services.catalog import format_price

from .conftest import post_update, start_chat, tg_update


def test_parse_model_json_variants():
    assert parse_model_json('{"reply": "a"}') == {"reply": "a"}
    assert parse_model_json('```json\n{"reply": "b"}\n```') == {"reply": "b"}
    assert parse_model_json('Вот ответ: {"reply": "c"} надеюсь помог') == {"reply": "c"}
    assert parse_model_json('{"reply": "незакрытый') is None
    assert parse_model_json("[1, 2]") is None
    assert parse_model_json(None) is None


class _Resp:
    def __init__(self, status, payload):
        self.status_code = status
        self._payload = payload

    def json(self):
        return self._payload


class _Session:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def post(self, url, headers=None, json=None, timeout=None):
        self.calls.append({"url": url, "headers": headers})
        return self.responses.pop(0)


def _candidate(text):
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def test_gemini_key_in_header_and_model_fallback():
    session = _Session([_Resp(404, {"error": "no model"}), _Resp(200, _candidate('{"reply": "ok"}'))])
    client = GeminiClient("SECRET-KEY", ["missing-model", "good-model"], session=session, sleep=lambda s: None)
    parsed, model = client.generate_json("sys", [{"role": "user", "parts": [{"text": "hi"}]}])
    assert parsed == {"reply": "ok"} and model == "good-model"
    for call in session.calls:
        assert "SECRET-KEY" not in call["url"]
        assert call["headers"]["x-goog-api-key"] == "SECRET-KEY"


def test_gemini_retries_on_429_then_gives_up():
    session = _Session([_Resp(429, {}), _Resp(429, {})])
    client = GeminiClient("k", ["m"], session=session, sleep=lambda s: None)
    assert client.generate_json("s", []) == (None, None)
    assert len(session.calls) == 2


def test_gemini_respects_deadline():
    ticks = iter([0, 100])
    client = GeminiClient("k", ["m"], deadline=10, session=_Session([]), monotonic=lambda: next(ticks))
    assert client.generate_json("s", []) == (None, None)


def test_format_price_no_double_currency():
    assert format_price("18 000 ₸") == "18 000 ₸"
    assert format_price("5000 тг") == "5000 тг"
    assert format_price("1200") == "1200 ₸"


def test_unknown_amounts_detection():
    catalog = [{"name": "Торт", "price": "5 000 ₸"}, {"name": "Кофе", "price": "1200"}]
    items = [{"name": "Торт", "quantity": 2}]
    assert find_unknown_amounts("Торт 5 000 ₸, итого 10 000 тг", catalog, items) == []
    assert find_unknown_amounts("Торт со скидкой 4 500 ₸", catalog, items) == ["4 500 ₸"]
    assert find_unknown_amounts("Доставка 1000 тг", catalog, [], ["Доставка по городу 1000 тенге"]) == []


def test_prompt_contains_business_kb_and_honest_stock():
    user = {"business_name": "Кофейня", "business_profile": {"hours": "9:00–21:00", "tone": "дружелюбный"}}
    prompt = build_system_prompt(
        user,
        [{"name": "Латте", "price": "1500", "stock": ""}, {"name": "Чизкейк", "price": "2000", "stock": "0"}],
        [{"question": "Есть парковка?", "answer": "Да, бесплатная"}],
    )
    assert "Кофейня" in prompt and "9:00–21:00" in prompt and "дружелюбный" in prompt
    assert "Латте — 1500 ₸ (наличие уточнить у владельца)" in prompt
    assert "Чизкейк — 2000 ₸ (нет в наличии)" in prompt
    assert "Есть парковка?" in prompt
    assert "тг тг" not in prompt


def test_contents_alternate_roles():
    history = [{"notes": "a", "ai_response": None}, {"notes": "b", "ai_response": "ответ"}, {"notes": None, "ai_response": "владелец"}]
    contents = build_contents(history, "c")
    roles = [c["role"] for c in contents]
    assert roles == ["user", "model", "user"]
    assert contents[0]["parts"][0]["text"] == "a\nb"


def test_wants_human_multilingual():
    assert wants_human("Позовите менеджера, пожалуйста")
    assert wants_human("I want to talk to a human")
    assert not wants_human("Сколько стоит торт?")


def test_ai_reply_flow(client, owner, gemini, telegram, svc):
    start_chat(client, owner["company_id"], telegram_id=301)
    gemini.push(reply="Здравствуйте! Чем помочь?")
    post_update(client, tg_update(301, "Здравствуйте"))
    assert telegram.texts_to(301)[-1] == "Здравствуйте! Чем помочь?"
    lead = svc.store.leads.find_one({"telegram_id": 301, "notes": "Здравствуйте"})
    assert lead["answer_source"] == "ai" and lead["status"] == "bot" and lead["answered"] is True


def test_raw_json_never_sent_to_client(client, owner, gemini, telegram, svc):
    start_chat(client, owner["company_id"], telegram_id=302)
    gemini.push(reply="")  # пустой reply — некорректный ответ
    post_update(client, tg_update(302, "Вопрос"))
    gemini.responses.append(None)  # модель недоступна / не-JSON
    post_update(client, tg_update(302, "Ещё вопрос"))
    for text in telegram.texts_to(302):
        assert "{" not in text and "reply" not in text
    conv = svc.store.conversations.find_one({"telegram_id": 302})
    assert conv["mode"] == "manual" and conv["manual_reason"] == "ai_handoff"


def test_invented_price_triggers_handoff(client, owner, gemini, telegram, svc):
    client.post("/api/services", json={"name": "Торт", "price": "5000"})
    start_chat(client, owner["company_id"], telegram_id=303)
    gemini.push(reply="Для вас торт за 3 900 ₸!")
    post_update(client, tg_update(303, "Сделаете скидку?"))
    assert "3 900" not in telegram.texts_to(303)[-1]
    conv = svc.store.conversations.find_one({"telegram_id": 303})
    assert conv["mode"] == "manual" and "не из каталога" in conv["handoff_reason"]


def test_payment_not_sent_for_unknown_or_out_of_stock_items(client, owner, gemini, telegram):
    client.post("/api/services", json={"name": "Торт", "price": "5000", "stock": "1"})
    client.patch("/api/settings/payment", json={"payment_info": "Kaspi Gold"})
    start_chat(client, owner["company_id"], telegram_id=304)
    gemini.push(reply="Оформляю", items=[{"name": "Торт", "quantity": 3}], wants_payment=True)
    post_update(client, tg_update(304, "3 торта"))
    gemini.push(reply="Оформляю", items=[{"name": "Пицца", "quantity": 1}], wants_payment=True)
    post_update(client, tg_update(304, "Пиццу"))
    assert not any("Kaspi" in t for t in telegram.texts_to(304))


def test_knowledge_base_exact_answer_skips_ai(client, owner, gemini, telegram):
    client.post("/api/knowledge-base", json={"question": "Где вы находитесь?", "answer": "Абая 10"})
    start_chat(client, owner["company_id"], telegram_id=305)
    post_update(client, tg_update(305, "где вы находитесь"))
    assert telegram.texts_to(305)[-1] == "Абая 10"
    assert gemini.calls == []


def test_kb_and_profile_passed_to_ai(client, owner, gemini):
    client.post("/api/knowledge-base", json={"question": "Есть доставка?", "answer": "Да, по Астане 1000 ₸"})
    client.patch("/api/settings/business", json={"hours": "10:00-20:00"})
    start_chat(client, owner["company_id"], telegram_id=306)
    gemini.push(reply="Доставка по Астане 1000 ₸")
    post_update(client, tg_update(306, "А доставка сколько стоит?"))
    system = gemini.calls[-1]["system"]
    assert "Есть доставка?" in system and "10:00-20:00" in system


def test_client_asks_for_human(client, owner, gemini, telegram, svc):
    svc.store.users.update_one({"company_id": owner["company_id"]}, {"$set": {"owner_telegram_id": 999}})
    start_chat(client, owner["company_id"], telegram_id=307)
    post_update(client, tg_update(307, "Позовите менеджера"))
    assert gemini.calls == []
    assert "передаю ваш вопрос владельцу" in telegram.texts_to(307)[-1]
    assert any("Нужен ваш ответ" in t for t in telegram.texts_to(999))
    conv = svc.store.conversations.find_one({"telegram_id": 307})
    assert conv["mode"] == "manual" and conv["manual_reason"] == "client_request"
