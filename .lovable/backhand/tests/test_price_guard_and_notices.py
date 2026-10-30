"""Проверка цен в ответах AI и разделение сообщений клиенту и уведомлений владельцу.

Случай из production (30.10.2026): клиент спросил «По чем они», AI ответил ценами из каталога,
но диалог ушёл владельцу с причиной «AI назвал цену не из каталога: 10 000 ₸», хотя в каталоге
есть «торт медовик — 10 000 ₸» и «Торт «Медовик» классический — 6500 ₸».
"""

import pytest

from zhauap.services.ai import (
    CLIENT_HOLD_REPLY,
    build_system_prompt,
    find_unknown_amounts,
    product_key,
)
from zhauap.services.catalog import price_amount

from .conftest import post_update, start_chat, tg_update

NNBSP = " "  # узкий неразрывный пробел — так разделяет разряды Excel/Numbers на Mac
NBSP = " "
THIN = " "

MEDOVIK = {"name": "торт медовик", "price": f"10{NNBSP}000 ₸", "stock": "3"}
MEDOVIK_CLASSIC = {"name": "Торт «Медовик» классический", "price": "6500 ₸", "stock": "5"}

INTERNAL_PHRASES = (
    "AI назвал цену",
    "не из каталога",
    "Вопрос клиента требует проверки",
    "Причина",
    "Нужен ваш ответ",
    "нужен ответ владельца",
    "Уведомление для владельца",
    "handoff",
)


def _assert_client_clean(texts):
    for text in texts:
        for phrase in INTERNAL_PHRASES:
            assert phrase.lower() not in text.lower(), f"клиент получил служебный текст: {text!r}"


# ---------------------------- разбор цен ----------------------------


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("10 000 ₸", 10000),
        (f"10{NBSP}000 ₸", 10000),
        (f"10{NNBSP}000 ₸", 10000),
        (f"10{THIN}000 ₸", 10000),
        ("10.000", 10000),
        ("10,000 тг", 10000),
        ("10000", 10000),
        ("6500 ₸", 6500),
        ("1 500,50", 1500.5),
        ("1.500,50", 1500.5),
        ("1,500.50", 1500.5),
        ("1500,5", 1500.5),
        ("10000.00", 10000),
        ("1 210 000 ₸", 1210000),
        ("цена договорная", None),
    ],
)
def test_price_amount_understands_thousand_separators(raw, expected):
    assert price_amount(raw) == expected


def test_product_key_ignores_quotes_case_and_spaces():
    assert product_key("Торт «Медовик» классический") == product_key("торт  медовик классический")
    assert product_key("Торт «Медовик» классический") != product_key("торт медовик")


# ---------------------------- проверка сумм в ответе ----------------------------


def test_exact_production_case_prices_from_catalog_pass():
    catalog = [MEDOVIK, MEDOVIK_CLASSIC]
    reply = "У нас два медовика:\nТорт медовик — 10 000 ₸\nТорт «Медовик» классический — 6 500 ₸"
    assert find_unknown_amounts(reply, catalog, []) == []
    # Модель может написать разряды по-другому — это та же цена.
    assert find_unknown_amounts(f"Торт медовик — 10{NNBSP}000 ₸", catalog, []) == []
    assert find_unknown_amounts("Торт медовик — 10.000 ₸", catalog, []) == []
    assert find_unknown_amounts("Торт медовик — 10000 тг", catalog, []) == []


def test_invented_price_still_caught_with_similar_names():
    catalog = [MEDOVIK, MEDOVIK_CLASSIC]
    assert find_unknown_amounts("Торт медовик — 9 000 ₸", catalog, []) == ["9 000 ₸"]
    assert find_unknown_amounts("Для вас скидка: 6 000 ₸", catalog, []) == ["6 000 ₸"]


def test_line_break_does_not_glue_numbers():
    catalog = [{"name": "Торт «Медовик» 1 кг", "price": "9 500 ₸", "stock": "4"}]
    reply = "Торт «Медовик» 1 кг, в наличии: 4\n9 500 ₸ за штуку"
    assert find_unknown_amounts(reply, catalog, []) == []


def test_order_total_for_similar_products():
    catalog = [MEDOVIK, MEDOVIK_CLASSIC]
    items = [{"name": "торт медовик", "quantity": 1}, {"name": "Торт «Медовик» классический", "quantity": 2}]
    assert find_unknown_amounts("Итого: 23 000 ₸", catalog, items) == []


def test_prompt_asks_to_clarify_ambiguous_question():
    prompt = build_system_prompt({"business_name": "Медовик Демо"}, [MEDOVIK, MEDOVIK_CLASSIC], [])
    assert "по чем они" in prompt.lower()
    assert "needs_human не нужен" in prompt
    assert f"торт медовик — 10{NNBSP}000 ₸" in prompt


# ---------------------------- весь путь через Telegram ----------------------------


def _catalog(client):
    for product in (MEDOVIK, MEDOVIK_CLASSIC):
        assert client.post("/api/services", json=product).status_code == 201


def _owner_tg(svc, owner, telegram_id=999):
    svc.store.users.update_one({"company_id": owner["company_id"]}, {"$set": {"owner_telegram_id": telegram_id}})


def test_po_chem_oni_answered_by_ai_without_handoff(client, owner, gemini, telegram, svc):
    _catalog(client)
    _owner_tg(svc, owner)
    start_chat(client, owner["company_id"], telegram_id=601)
    gemini.push(reply="Да, есть два медовика: торт медовик и Торт «Медовик» классический.")
    post_update(client, tg_update(601, "Медовик есть?"))
    answer = "Торт медовик — 10 000 ₸\nТорт «Медовик» классический — 6 500 ₸\nКакой вам больше подходит?"
    gemini.push(reply=answer)
    post_update(client, tg_update(601, "По чем они"))

    assert telegram.texts_to(601)[-1] == answer
    conv = svc.store.conversations.find_one({"telegram_id": 601})
    assert conv["mode"] == "bot" and not conv.get("handoff_reason")
    assert not any("Нужен ваш ответ" in t for t in telegram.texts_to(999))
    # Модель получила контекст: предыдущий вопрос и оба товара в каталоге.
    call = gemini.calls[-1]
    assert "Медовик есть?" in str(call["contents"]) and "6500 ₸" in call["system"]


def test_items_with_quotes_and_case_match_catalog(client, owner, gemini, telegram, svc):
    _catalog(client)
    client.patch("/api/settings/payment", json={"payment_info": "Kaspi Gold"})
    start_chat(client, owner["company_id"], telegram_id=602)
    gemini.push(
        reply="Оформляю Торт «Медовик» классический — 6 500 ₸.",
        items=[{"name": "торт медовик классический", "quantity": 1}],
        wants_payment=True,
    )
    post_update(client, tg_update(602, "Беру классический"))
    session = svc.store.user_sessions.find_one({"telegram_id": 602})
    assert session["carts"][owner["company_id"]] == [{"name": "Торт «Медовик» классический", "quantity": 1}]
    assert any("Kaspi" in t for t in telegram.texts_to(602))


# ---------------------------- клиенту — нейтрально, владельцу — причина ----------------------------


def test_invented_price_client_gets_neutral_text_owner_gets_reason(client, owner, gemini, telegram, svc):
    _catalog(client)
    _owner_tg(svc, owner)
    start_chat(client, owner["company_id"], telegram_id=603)
    gemini.push(reply="Для вас медовик за 7 777 ₸!")
    post_update(client, tg_update(603, "Сделаете скидку?"))

    client_texts = telegram.texts_to(603)
    assert client_texts[-1] == CLIENT_HOLD_REPLY
    assert not any("7 777" in t for t in client_texts)
    _assert_client_clean(client_texts)

    owner_texts = telegram.texts_to(999)
    notice = next(t for t in owner_texts if "Нужен ваш ответ" in t)
    assert "Уведомление для владельца" in notice
    assert "AI назвал цену не из каталога: 7 777 ₸" in notice
    assert "Сделаете скидку?" in notice and "7 777" in notice  # черновик AI виден владельцу

    lead = svc.store.leads.find_one({"telegram_id": 603, "notes": "Сделаете скидку?"})
    assert lead["ai_response"] == CLIENT_HOLD_REPLY
    assert "7 777" in lead["ai_draft"]
    assert "не из каталога" in lead["handoff_reason"]


def test_model_handoff_text_never_reaches_client(client, owner, gemini, telegram, svc):
    _owner_tg(svc, owner)
    start_chat(client, owner["company_id"], telegram_id=604)
    gemini.push(
        reply="Нужен ответ владельца. Причина: в каталоге нет торта без сахара, handoff.",
        needs_human=True,
        handoff_reason="Торт без сахара — нет в каталоге",
    )
    post_update(client, tg_update(604, "Есть торт без сахара на 30 человек?"))
    assert telegram.texts_to(604)[-1] == CLIENT_HOLD_REPLY
    _assert_client_clean(telegram.texts_to(604))
    assert any("Торт без сахара — нет в каталоге" in t for t in telegram.texts_to(999))


def test_internal_text_in_normal_reply_is_replaced(client, owner, gemini, telegram, svc):
    start_chat(client, owner["company_id"], telegram_id=605)
    gemini.push(reply="AI назвал цену не из каталога. Вопрос клиента требует проверки.")
    post_update(client, tg_update(605, "Привет"))
    assert telegram.texts_to(605)[-1] == CLIENT_HOLD_REPLY
    _assert_client_clean(telegram.texts_to(605))


def test_ai_unavailable_client_gets_neutral_text(client, owner, gemini, telegram, svc):
    _owner_tg(svc, owner)
    start_chat(client, owner["company_id"], telegram_id=606)
    gemini.responses.append(None)
    post_update(client, tg_update(606, "Сколько стоит медовик?"))
    assert telegram.texts_to(606)[-1] == CLIENT_HOLD_REPLY
    _assert_client_clean(telegram.texts_to(606))
    assert any("AI недоступен" in t for t in telegram.texts_to(999))


def test_owner_testing_own_bot_does_not_get_notice_in_client_chat(client, owner, gemini, telegram, svc):
    _catalog(client)
    _owner_tg(svc, owner, telegram_id=607)  # владелец пишет своему боту как клиент
    start_chat(client, owner["company_id"], telegram_id=607)
    gemini.push(reply="Для вас медовик за 7 777 ₸!")
    post_update(client, tg_update(607, "Скидку?"))
    texts = telegram.texts_to(607)
    assert texts[-1] == CLIENT_HOLD_REPLY
    _assert_client_clean(texts)
    # Уведомление осталось на сайте (колокольчик), просто не в этом Telegram-чате.
    assert client.get("/api/notifications").get_json()["need_owner"] == 1


def test_owner_notices_never_saved_in_client_history(client, owner, gemini, telegram, svc):
    _catalog(client)
    _owner_tg(svc, owner)
    start_chat(client, owner["company_id"], telegram_id=608)
    gemini.push(reply="Для вас медовик за 7 777 ₸!")
    post_update(client, tg_update(608, "Скидку?"))
    post_update(client, tg_update(608, "Алло?"))  # ручной режим: владельцу уходит «клиент ждёт»
    for lead in svc.store.leads.find({"telegram_id": 608}):
        _assert_client_clean([lead.get("ai_response") or ""])
    messages = client.get("/api/conversations/tg:608/messages").get_json()
    rendered = str(messages)
    assert "Уведомление для владельца" not in rendered and "Нужен ваш ответ" not in rendered


def test_owner_reply_from_inbox_goes_to_client(client, owner, gemini, telegram, svc):
    _owner_tg(svc, owner)
    start_chat(client, owner["company_id"], telegram_id=609)
    gemini.push(reply="Уточню.", needs_human=True, handoff_reason="Опт")
    post_update(client, tg_update(609, "Есть опт?"))
    response = client.post("/api/conversations/tg:609/send", json={"message": "Да, от 10 штук скидка 5%"})
    assert response.status_code == 200
    assert telegram.texts_to(609)[-1] == "Да, от 10 штук скидка 5%"
    assert not any("Да, от 10 штук" in t for t in telegram.texts_to(999))


def test_resume_after_timeout_client_text_is_clean(client, owner, gemini, telegram, svc, clock):
    _owner_tg(svc, owner)
    start_chat(client, owner["company_id"], telegram_id=610)
    gemini.push(reply="Уточню.", needs_human=True, handoff_reason="Опт")
    post_update(client, tg_update(610, "Есть опт?"))
    clock.advance(minutes=11)
    gemini.responses.append(None)  # AI недоступен в момент возврата
    assert svc.assistant.run_due_resumes() == 1
    assert telegram.texts_to(610)[-1].startswith("Извините за ожидание")
    _assert_client_clean(telegram.texts_to(610))
    assert any("AI продолжил диалог" in t for t in telegram.texts_to(999))
