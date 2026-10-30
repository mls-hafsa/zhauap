"""Данные одной компании недоступны другой ни через один эндпоинт."""

from .conftest import make_client, register, start_chat, post_update, tg_update


def test_company_isolation(app, svc, gemini):
    a = make_client(app)
    b = make_client(app)
    company_a = register(a, business_name="A")["company_id"]
    register(b, business_name="B")

    service_id = a.post("/api/services", json={"name": "Капучино", "price": "1200"}).get_json()["id"]
    kb_id = a.post("/api/knowledge-base", json={"question": "Адрес?", "answer": "Абая 1"}).get_json()["id"]
    gemini.push(reply="Здравствуйте!")
    start_chat(a, company_a, telegram_id=901)
    post_update(a, tg_update(901, "Привет"))
    payment = svc.store.payments.insert_one(
        {"company_id": company_a, "telegram_id": 901, "status": "pending", "items": [], "file_id": "file-1"}
    ).inserted_id

    assert b.get("/api/services").get_json() == []
    assert b.get("/api/knowledge-base").get_json() == []
    assert b.get("/api/leads").get_json() == []
    assert b.get("/api/conversations").get_json()["items"] == []
    assert b.get("/api/payments/pending").get_json() == []
    assert b.patch(f"/api/services/{service_id}", json={"price": "1"}).status_code == 404
    assert b.delete(f"/api/services/{service_id}").status_code == 404
    assert b.delete(f"/api/knowledge-base/{kb_id}").status_code == 404
    assert b.get(f"/api/payments/{payment}/photo").status_code == 404
    assert b.post(f"/api/payments/{payment}/verify", json={"status": "approved"}).status_code == 404
    # Ответить чужому клиенту нельзя: у компании B этого клиента нет.
    assert b.post("/api/conversations/tg:901/send", json={"message": "hi"}).status_code == 404
    assert svc.store.services.find_one({"company_id": company_a})["price"] == "1200"


def test_unauthenticated_access_denied(client):
    for path in ["/api/leads", "/api/services", "/api/conversations", "/api/stats", "/api/notifications",
                 "/api/settings/payment", "/api/settings/business", "/api/settings/telegram", "/api/payments/pending"]:
        assert client.get(path).status_code == 401, path
