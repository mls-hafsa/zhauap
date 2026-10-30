"""Передача владельцу, таймер 10 минут и отсутствие конфликтов AI/владелец."""

from zhauap import create_app

from .conftest import make_client, post_update, start_chat, tg_update


def _handoff(client, owner, gemini, svc, telegram_id=401):
    svc.store.users.update_one({"company_id": owner["company_id"]}, {"$set": {"owner_telegram_id": 950}})
    start_chat(client, owner["company_id"], telegram_id=telegram_id)
    gemini.push(reply="Уточню у владельца и вернусь с ответом.", needs_human=True, handoff_reason="Спрашивают про опт")
    post_update(client, tg_update(telegram_id, "Есть оптовые цены?"))
    return svc.store.conversations.find_one({"telegram_id": telegram_id})


def test_ai_handoff_notifies_owner_and_dashboard(client, owner, gemini, telegram, svc):
    conv = _handoff(client, owner, gemini, svc)
    assert conv["mode"] == "manual" and conv["awaiting_since"]
    assert any("Спрашивают про опт" in t for t in telegram.texts_to(950))
    notes = client.get("/api/notifications").get_json()
    assert notes["need_owner"] == 1 and notes["items"][0]["key"] == "tg:401"
    item = client.get("/api/conversations").get_json()["items"][0]
    assert item["status"] == "need" and item["handoff_reason"] == "Спрашивают про опт"


def test_manual_mode_stores_messages_without_reply(client, owner, gemini, telegram, svc):
    _handoff(client, owner, gemini, svc)
    sent_before = len(telegram.texts_to(401))
    post_update(client, tg_update(401, "Алло?"))
    assert len(telegram.texts_to(401)) == sent_before
    lead = svc.store.leads.find_one({"notes": "Алло?"})
    assert lead["status"] == "need" and lead["answered"] is False


def test_ai_resumes_after_timeout_exactly_once(client, owner, gemini, telegram, svc, clock):
    _handoff(client, owner, gemini, svc)
    clock.advance(minutes=9)
    assert svc.assistant.run_due_resumes() == 0
    clock.advance(minutes=2)
    gemini.push(reply="Извините за ожидание! Оптовых цен в каталоге нет, владелец свяжется позже.")
    assert svc.assistant.run_due_resumes() == 1
    assert telegram.texts_to(401)[-1].startswith("Извините за ожидание")
    conv = svc.store.conversations.find_one({"telegram_id": 401})
    assert conv["mode"] == "bot" and "awaiting_since" not in conv
    assert svc.store.leads.count_documents({"telegram_id": 401, "answered": False}) == 0
    assert any("AI продолжил диалог" in t for t in telegram.texts_to(950))
    # Повторный тик ничего не отправляет.
    sent = len(telegram.sent)
    assert svc.assistant.run_due_resumes() == 0
    assert len(telegram.sent) == sent


def test_resume_prompt_mentions_waiting(client, owner, gemini, svc, clock):
    _handoff(client, owner, gemini, svc)
    clock.advance(minutes=11)
    gemini.push(reply="Извините за ожидание!")
    svc.assistant.run_due_resumes()
    assert "клиент ждал ответа владельца" in gemini.calls[-1]["system"]


def test_owner_reply_resets_timer_and_cancels_resume(client, owner, gemini, telegram, svc, clock):
    _handoff(client, owner, gemini, svc)
    clock.advance(minutes=8)
    response = client.post("/api/conversations/tg:401/send", json={"message": "Да, от 10 штук скидка 5%"})
    assert response.status_code == 200
    assert telegram.texts_to(401)[-1] == "Да, от 10 штук скидка 5%"
    clock.advance(minutes=5)  # 13 минут с эскалации, но 5 с ответа владельца
    assert svc.assistant.run_due_resumes() == 0
    lead = svc.store.leads.find_one({"answer_source": "owner"})
    assert lead["telegram_id"] == 401 and lead["status"] == "owner"
    # Владелец ответил, клиент ничего не ждёт: по истечении таймера AI молча возвращается.
    clock.advance(minutes=6)
    sent = len(telegram.texts_to(401))
    assert svc.assistant.run_due_resumes() == 1
    assert len(telegram.texts_to(401)) == sent
    assert svc.store.conversations.find_one({"telegram_id": 401})["mode"] == "bot"


def test_client_message_after_owner_reply_gets_new_window(client, owner, gemini, telegram, svc, clock):
    _handoff(client, owner, gemini, svc)
    client.post("/api/conversations/tg:401/send", json={"message": "Сейчас уточню"})
    clock.advance(minutes=9)
    post_update(client, tg_update(401, "Жду"))
    clock.advance(minutes=2)  # 11 мин с ответа владельца, 2 мин с вопроса клиента
    assert svc.assistant.run_due_resumes() == 0
    clock.advance(minutes=9)
    gemini.push(reply="Извините за ожидание, владелец скоро ответит.")
    assert svc.assistant.run_due_resumes() == 1


def test_stale_ai_reply_not_sent_when_owner_takes_over(client, owner, gemini, telegram, svc):
    start_chat(client, owner["company_id"], telegram_id=402)

    def owner_takes_over_during_generation():
        response = client.patch("/api/conversations/tg:402", json={"mode": "manual"})
        assert response.status_code == 200

    gemini.push(reply="Ответ AI, который уже устарел")
    gemini.before_return = owner_takes_over_during_generation
    post_update(client, tg_update(402, "Вопрос"))
    assert "Ответ AI, который уже устарел" not in telegram.texts_to(402)
    lead = svc.store.leads.find_one({"telegram_id": 402, "notes": "Вопрос"})
    assert lead["answered"] is False and lead["status"] == "need"


def test_resume_dropped_if_owner_replies_during_generation(client, owner, gemini, telegram, svc, clock):
    _handoff(client, owner, gemini, svc)
    clock.advance(minutes=11)

    def owner_replies():
        client.post("/api/conversations/tg:401/send", json={"message": "Владелец на связи"})

    gemini.push(reply="Устаревший ответ AI")
    gemini.before_return = owner_replies
    svc.assistant.run_due_resumes()
    assert "Устаревший ответ AI" not in telegram.texts_to(401)
    assert telegram.texts_to(401)[-1] == "Владелец на связи"
    assert svc.store.conversations.find_one({"telegram_id": 401})["mode"] == "manual"


def test_client_message_after_timeout_answered_immediately(client, owner, gemini, telegram, svc, clock):
    _handoff(client, owner, gemini, svc)
    clock.advance(minutes=12)
    gemini.push(reply="Отвечаю на всё сразу")
    post_update(client, tg_update(401, "Есть кто?"))
    assert telegram.texts_to(401)[-1] == "Отвечаю на всё сразу"
    conv = svc.store.conversations.find_one({"telegram_id": 401})
    assert conv["mode"] == "bot" and "awaiting_since" not in conv
    history_text = " ".join(c["parts"][0]["text"] for c in gemini.calls[-1]["contents"])
    assert "Есть оптовые цены?" in history_text and "Есть кто?" in history_text


def test_hand_back_answers_waiting_client_now(client, owner, gemini, telegram, svc):
    _handoff(client, owner, gemini, svc)
    gemini.push(reply="Продолжаю вместо владельца")
    response = client.patch("/api/conversations/tg:401", json={"mode": "bot"})
    assert response.status_code == 200 and response.get_json()["mode"] == "bot"
    assert telegram.texts_to(401)[-1] == "Продолжаю вместо владельца"


def test_owner_takeover_and_manual_send_from_bot_mode(client, owner, gemini, telegram, svc):
    start_chat(client, owner["company_id"], telegram_id=403)
    gemini.push(reply="Привет")
    post_update(client, tg_update(403, "Привет"))
    response = client.post("/api/conversations/tg:403/send", json={"message": "Это владелец"})
    assert response.status_code == 200 and response.get_json()["mode"] == "manual"
    state = client.get("/api/conversations/tg:403").get_json()
    assert state["mode"] == "manual" and state["minutes_left"] == 10


def test_owner_send_failure_reported(client, owner, gemini, telegram, svc):
    start_chat(client, owner["company_id"], telegram_id=404)
    gemini.push(reply="Привет")
    post_update(client, tg_update(404, "Привет"))
    telegram.fail = True
    response = client.post("/api/conversations/tg:404/send", json={"message": "Ответ"})
    assert response.status_code == 502 and "blocked" in response.get_json()["error"]
    assert svc.store.leads.count_documents({"answer_source": "owner"}) == 0


def test_timer_survives_restart(client, owner, gemini, telegram, svc, clock, config, store):
    _handoff(client, owner, gemini, svc)
    # «Перезапуск»: новое приложение с той же базой — состояние таймера в MongoDB.
    restarted = create_app(config, store=store, telegram=telegram, gemini=gemini, clock=clock)
    clock.advance(minutes=11)
    gemini.push(reply="После перезапуска всё равно отвечаю")
    response = make_client(restarted).post("/api/internal/tick", headers={"X-Internal-Token": "tick-token"})
    assert response.get_json()["resumed"] == 1
    assert telegram.texts_to(401)[-1] == "После перезапуска всё равно отвечаю"


def test_legacy_manual_conversation_expires(client, owner, gemini, svc, clock, telegram):
    """Старый документ: только contact + manual_since, без resume_at/telegram_id."""
    start_chat(client, owner["company_id"], telegram_id=405, username="legacy_user")
    svc.store.conversations.insert_one(
        {"company_id": owner["company_id"], "contact": "legacy_user", "mode": "manual", "manual_since": clock.now}
    )
    gemini.push(reply="ok")
    post_update(client, tg_update(405, "Привет", username="legacy_user"))
    # Подхвачен старый документ: 0 минут прошло — ручной режим, бот молчит.
    assert telegram.texts_to(405)[-1].startswith("Здравствуйте")
    clock.advance(minutes=11)
    assert svc.assistant.run_due_resumes() == 1
