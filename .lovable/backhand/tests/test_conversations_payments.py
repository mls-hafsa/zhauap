from .conftest import post_update, start_chat, tg_update


def _chat(client, owner, gemini, telegram_id, text="Привет", username=None, clock=None):
    start_chat(client, owner["company_id"], telegram_id=telegram_id, username=username or f"user{telegram_id}")
    gemini.push(reply="Ответ")
    post_update(client, tg_update(telegram_id, text, username=username or f"user{telegram_id}"))
    if clock:
        clock.advance(seconds=1)


def test_conversation_list_and_messages(client, owner, gemini, clock):
    for tid in (501, 502, 503):
        _chat(client, owner, gemini, tid, clock=clock)
    body = client.get("/api/conversations?limit=2").get_json()
    assert body["total"] == 3 and len(body["items"]) == 2 and body["has_more"] is True
    assert body["items"][0]["key"] == "tg:503"  # новые сверху
    assert body["counts"]["bot"] == 3
    search = client.get("/api/conversations?q=user502").get_json()
    assert [i["key"] for i in search["items"]] == ["tg:502"]

    for i in range(3):
        gemini.push(reply=f"r{i}")
        post_update(client, tg_update(501, f"m{i}", username="user501"))
        clock.advance(seconds=1)
    page = client.get("/api/conversations/tg:501/messages?limit=2").get_json()
    assert [m["notes"] for m in page["items"]] == ["m1", "m2"] and page["has_more"] is True
    older = client.get(f"/api/conversations/tg:501/messages?limit=10&before={page['items'][0]['created_at']}").get_json()
    assert [m["notes"] for m in older["items"]] == ["Привет", "m0"]


def test_legacy_contact_only_leads_still_listed(client, owner, svc):
    svc.store.leads.insert_one(
        {"company_id": owner["company_id"], "contact": "old_client", "notes": "старое", "status": "bot"}
    )
    items = client.get("/api/conversations").get_json()["items"]
    assert items[0]["key"] == "c:old_client" and items[0]["display_contact"] == "old_client"
    assert client.get("/api/conversations/c:old_client/messages").get_json()["items"][0]["notes"] == "старое"
    # Старый frontend передавал просто contact — тоже работает.
    assert client.get("/api/conversations/old_client").status_code == 200


def test_archive_keeps_history_and_reopens_on_new_message(client, owner, gemini, svc):
    _chat(client, owner, gemini, 504)
    assert client.delete("/api/leads/by-contact/user504").status_code == 200
    assert client.get("/api/conversations").get_json()["items"] == []
    assert svc.store.leads.count_documents({"telegram_id": 504}) == 1  # ничего не удалено
    gemini.push(reply="С возвращением")
    post_update(client, tg_update(504, "Я снова тут", username="user504"))
    assert [i["key"] for i in client.get("/api/conversations").get_json()["items"]] == ["tg:504"]


def test_leads_endpoint_compat_and_soft_delete(client, owner, gemini, svc):
    _chat(client, owner, gemini, 505)
    leads = client.get("/api/leads").get_json()
    assert leads[0]["key"] == "tg:505" and leads[0]["channel"] == "telegram"
    assert client.delete(f"/api/leads/{leads[0]['_id']}").status_code == 200
    assert client.get("/api/leads").get_json() == []
    assert svc.store.leads.count_documents({}) == 1


def test_stats(client, owner, gemini):
    _chat(client, owner, gemini, 506)
    _chat(client, owner, gemini, 507)
    stats = client.get("/api/stats").get_json()
    assert stats["total_leads"] == 2 and stats["total_bot_replies"] == 2
    assert stats["active_leads"] == 2 and stats["waiting_owner"] == 0
    assert "total_returns" not in stats


def _payment(client, owner, gemini, svc, telegram_id=508, stock="5"):
    client.post("/api/services", json={"name": "Торт", "price": "5000", "stock": stock})
    start_chat(client, owner["company_id"], telegram_id=telegram_id)
    gemini.push(reply="Беру в работу", items=[{"name": "Торт", "quantity": 2}])
    post_update(client, tg_update(telegram_id, "Хочу 2 торта"))
    post_update(client, tg_update(telegram_id, photo=[{"file_id": "file-1"}]))
    return client.get("/api/payments/pending").get_json()[0]


def test_payment_verify_is_idempotent(client, owner, gemini, svc, telegram):
    payment = _payment(client, owner, gemini, svc)
    assert payment["items"] == [{"name": "Торт", "quantity": 2}]
    first = client.post(f"/api/payments/{payment['_id']}/verify", json={"status": "approved"})
    assert first.status_code == 200
    second = client.post(f"/api/payments/{payment['_id']}/verify", json={"status": "approved"})
    assert second.status_code == 409
    stock = client.get("/api/services").get_json()[0]["stock"]
    assert stock == "3"  # списано один раз
    assert "оплата подтверждена" in telegram.texts_to(508)[-1].lower()
    assert client.get("/api/payments/pending").get_json() == []


def test_payment_without_tracked_stock(client, owner, gemini, svc):
    payment = _payment(client, owner, gemini, svc, telegram_id=509, stock="")
    response = client.post(f"/api/payments/{payment['_id']}/verify", json={"status": "approved"})
    assert response.status_code == 200 and "warning" not in response.get_json()
    assert client.get("/api/services").get_json()[0]["stock"] == ""


def test_payment_photo_private(client, owner, gemini, svc):
    payment = _payment(client, owner, gemini, svc, telegram_id=510)
    response = client.get(f"/api/payments/{payment['_id']}/photo")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "private, no-store"
    assert response.data.startswith(b"\xff\xd8")


def test_conversation_status_wait_for_pending_payment(client, owner, gemini, svc):
    _payment(client, owner, gemini, svc, telegram_id=511)
    item = client.get("/api/conversations").get_json()["items"][0]
    assert item["status"] == "wait" and item["pending_payments"] == 1
