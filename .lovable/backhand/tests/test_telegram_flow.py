from .conftest import post_update, start_chat, tg_update


def test_owner_link_requires_one_time_code(client, owner, svc, telegram):
    company_id = owner["company_id"]
    # Старый способ /owner <company_id> отключён: ID компании публичен в ссылке клиента.
    post_update(client, tg_update(777, f"/owner {company_id}"))
    assert svc.store.users.find_one({"company_id": company_id}).get("owner_telegram_id") is None
    assert "отключена" in telegram.texts_to(777)[-1]

    code = client.post("/api/settings/telegram/link-code").get_json()["code"]
    post_update(client, tg_update(777, "/owner WRONGCODE"))
    assert svc.store.users.find_one({"company_id": company_id}).get("owner_telegram_id") is None

    post_update(client, tg_update(777, f"/owner {code}"))
    assert svc.store.users.find_one({"company_id": company_id})["owner_telegram_id"] == 777
    assert client.get("/api/settings/telegram").get_json()["owner_linked"] is True

    # Код одноразовый: злоумышленник с тем же кодом не перехватит привязку.
    post_update(client, tg_update(666, f"/owner {code}"))
    assert svc.store.users.find_one({"company_id": company_id})["owner_telegram_id"] == 777


def test_owner_link_via_deep_link_and_expiry(client, owner, svc, clock):
    code = client.post("/api/settings/telegram/link-code").get_json()["code"]
    svc.store.users.update_one(
        {"company_id": owner["company_id"]}, {"$set": {"owner_link.expires_at": clock.now.replace(year=2000)}}
    )
    post_update(client, tg_update(778, f"/start owner_{code}"))
    assert svc.store.users.find_one({"company_id": owner["company_id"]}).get("owner_telegram_id") is None

    code = client.post("/api/settings/telegram/link-code").get_json()["code"]
    post_update(client, tg_update(778, f"/start owner_{code}"))
    assert svc.store.users.find_one({"company_id": owner["company_id"]})["owner_telegram_id"] == 778


def test_start_validates_company(client, owner, svc, telegram):
    post_update(client, tg_update(201, "/start comp_deadbeef"))
    assert "недействительна" in telegram.texts_to(201)[-1]
    assert svc.store.user_sessions.find_one({"telegram_id": 201}) is None
    start_chat(client, owner["company_id"], telegram_id=201)
    assert "Тестовая кофейня" in telegram.texts_to(201)[-1]


def test_duplicate_update_processed_once(client, owner, gemini, telegram, svc):
    start_chat(client, owner["company_id"], telegram_id=202)
    gemini.push(reply="Ответ один раз")
    update = tg_update(202, "Сколько стоит?")
    assert post_update(client, update).get_json()["status"] == "ok"
    assert post_update(client, update).get_json()["status"] == "duplicate"
    assert telegram.texts_to(202).count("Ответ один раз") == 1
    assert svc.store.leads.count_documents({"telegram_id": 202, "notes": "Сколько стоит?"}) == 1


def test_message_saved_with_stable_client_id(client, owner, gemini, svc, clock):
    start_chat(client, owner["company_id"], telegram_id=203, username="old_nick")
    gemini.push(reply="Привет!")
    post_update(client, tg_update(203, "Привет", username="old_nick"))
    clock.advance(seconds=5)
    gemini.push(reply="Снова привет!")
    post_update(client, tg_update(203, "Это снова я", username="new_nick"))
    lead = svc.store.leads.find_one({"telegram_id": 203, "notes": "Привет"})
    assert lead["client_id"] == "tg:203" and lead["channel"] == "telegram"
    items = client.get("/api/conversations").get_json()["items"]
    assert len(items) == 1  # смена ника не раздваивает диалог
    assert items[0]["key"] == "tg:203" and items[0]["display_contact"] == "@new_nick"
    assert items[0]["message_count"] == 2


def test_unlinked_client_asked_to_open_link(client, telegram, gemini):
    post_update(client, tg_update(204, "Привет"))
    assert "ссылку компании" in telegram.texts_to(204)[-1]
    assert gemini.calls == []


def test_unsupported_message_type(client, owner, telegram):
    start_chat(client, owner["company_id"], telegram_id=205)
    post_update(client, tg_update(205, voice={"file_id": "v1"}))
    assert "только текстовые" in telegram.texts_to(205)[-1]


def test_group_chats_ignored(client, owner, telegram):
    update = tg_update(206, "/start " + owner["company_id"])
    update["message"]["chat"]["type"] = "group"
    post_update(client, update)
    assert telegram.texts_to(206) == []


def test_receipt_photo_and_pdf(client, owner, gemini, telegram, svc):
    company_id = owner["company_id"]
    client.post("/api/services", json={"name": "Торт", "price": "5000", "stock": "3"})
    svc.store.users.update_one({"company_id": company_id}, {"$set": {"owner_telegram_id": 900}})
    start_chat(client, company_id, telegram_id=207)
    gemini.push(reply="Отлично, торт 5000 ₸. Сейчас пришлю реквизиты.", items=[{"name": "торт", "quantity": 2}],
                wants_payment=True)
    client.patch("/api/settings/payment", json={"payment_info": "Kaspi 4400 ..."})
    post_update(client, tg_update(207, "Беру 2 торта"))
    assert any("Kaspi" in t for t in telegram.texts_to(207))

    post_update(client, tg_update(207, photo=[{"file_id": "file-1", "file_size": 100}]))
    post_update(client, tg_update(207, document={"file_id": "file-1", "mime_type": "application/pdf", "file_size": 10}))
    post_update(client, tg_update(207, document={"file_id": "file-1", "mime_type": "application/zip"}))
    payments = client.get("/api/payments/pending").get_json()
    assert len(payments) == 2
    assert payments[0]["items"] == [{"name": "Торт", "quantity": 2}]
    assert {p["mime_type"] for p in payments} == {"image/jpeg", "application/pdf"}
    assert any("Новый чек" in t for t in telegram.texts_to(900))
    assert "как фото или PDF" in telegram.texts_to(207)[-1]
