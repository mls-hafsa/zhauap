from zhauap import create_app
from zhauap.config import Config

from .conftest import PASSWORD, make_client, register


def test_register_rejects_weak_password(client):
    response = client.post("/api/register", json={"email": "a@b.kz", "password": "12345"})
    assert response.status_code == 400
    assert "не короче" in response.get_json()["error"]


def test_register_login_me_logout(client):
    account = register(client, email="Owner@Example.com")
    assert account["company_id"].startswith("comp_")
    assert account["telegram_link"].endswith(account["company_id"])
    assert client.get("/api/me").get_json()["email"] == "owner@example.com"
    client.post("/api/logout")
    assert client.get("/api/me").status_code == 401
    response = client.post("/api/login", json={"email": "owner@example.com", "password": PASSWORD})
    assert response.status_code == 200


def test_duplicate_registration(client):
    register(client, email="dup@example.com")
    response = client.post("/api/register", json={"email": "dup@example.com", "password": PASSWORD})
    assert response.status_code == 400


def test_login_rate_limit(client):
    register(client, email="rl@example.com")
    for _ in range(10):
        assert client.post("/api/login", json={"email": "rl@example.com", "password": "wrong1234"}).status_code == 401
    blocked = client.post("/api/login", json={"email": "rl@example.com", "password": PASSWORD})
    assert blocked.status_code == 429


def test_csrf_rejects_foreign_origin(app, owner):
    client = make_client(app)
    client.post("/api/login", json={"email": "x@y.kz", "password": "whatever1"})  # просто создаём сессию-клиент
    evil = app.test_client()
    evil.environ_base["HTTP_ORIGIN"] = "https://evil.example"
    response = evil.post("/api/services", json={"name": "x", "price": "1"})
    assert response.status_code == 403


def test_csrf_requires_origin_in_production(store, telegram, gemini, tmp_path):
    config = Config(env={"RENDER": "1"}, testing=True, secret_key="s", receipts_dir=str(tmp_path))
    app = create_app(config, store=store, telegram=telegram, gemini=gemini)
    client = app.test_client()
    response = client.post("/api/register", json={"email": "p@example.com", "password": PASSWORD})
    assert response.status_code == 403
    client.environ_base["HTTP_ORIGIN"] = "https://zhauap.vercel.app"
    assert client.post("/api/register", json={"email": "p@example.com", "password": PASSWORD}).status_code == 201
    # localhost в production не разрешён по умолчанию
    client.environ_base["HTTP_ORIGIN"] = "http://localhost:5173"
    assert client.post("/api/logout").status_code == 403


def test_change_password_invalidates_other_sessions(app, client):
    register(client, email="pw@example.com")
    other = make_client(app)
    assert other.post("/api/login", json={"email": "pw@example.com", "password": PASSWORD}).status_code == 200
    response = client.post(
        "/api/account/password", json={"current_password": PASSWORD, "new_password": "NewSecret456"}
    )
    assert response.status_code == 200
    assert client.get("/api/me").status_code == 200  # текущая сессия жива
    assert other.get("/api/me").status_code == 401  # другая — завершена


def test_password_reset_via_telegram(app, client, svc, telegram):
    account = register(client, email="reset@example.com")
    svc.store.users.update_one({"company_id": account["company_id"]}, {"$set": {"owner_telegram_id": 555}})
    anon = make_client(app)
    response = anon.post("/api/auth/forgot", json={"email": "reset@example.com"})
    assert response.status_code == 200
    sent = telegram.texts_to(555)
    assert sent and "Код для сброса" in sent[-1]
    code = sent[-1].split(": ")[1].split("\n")[0]

    bad = anon.post("/api/auth/reset", json={"email": "reset@example.com", "code": "000000", "password": "Another789"})
    assert bad.status_code == 400
    ok = anon.post("/api/auth/reset", json={"email": "reset@example.com", "code": code, "password": "Another789"})
    assert ok.status_code == 200
    assert client.get("/api/me").status_code == 401  # старая сессия сброшена
    assert anon.post("/api/login", json={"email": "reset@example.com", "password": "Another789"}).status_code == 200
    # код одноразовый
    again = anon.post("/api/auth/reset", json={"email": "reset@example.com", "code": code, "password": "Third7890"})
    assert again.status_code == 400


def test_forgot_does_not_reveal_unknown_email(client):
    known = client.post("/api/auth/forgot", json={"email": "nobody@example.com"})
    assert known.status_code == 200
    assert "Если аккаунт" in known.get_json()["message"]


def test_webhook_requires_secret(client):
    response = client.post("/api/telegram/webhook", json={"update_id": 1}, headers={"X-Telegram-Bot-Api-Secret-Token": "bad"})
    assert response.status_code == 403


def test_internal_tick_requires_token(client):
    assert client.post("/api/internal/tick").status_code == 403
    response = client.post("/api/internal/tick", headers={"X-Internal-Token": "tick-token"})
    assert response.status_code == 200


def test_too_large_request(client, owner):
    response = client.patch("/api/settings/payment", json={"payment_info": "x" * (7 * 1024 * 1024)})
    assert response.status_code == 413


def test_health(client):
    body = client.get("/api/health").get_json()
    assert body["ok"] is True and body["db_ok"] is True and body["telegram_configured"] is True


def test_preview_origin_regex(store, telegram, gemini, tmp_path):
    env = {"RENDER": "1", "FRONTEND_ORIGIN_REGEX": r"https://zhauap-[a-z0-9-]+-myteam\.vercel\.app"}
    config = Config(env=env, testing=True, secret_key="s", receipts_dir=str(tmp_path))
    app = create_app(config, store=store, telegram=telegram, gemini=gemini)
    client = app.test_client()
    client.environ_base["HTTP_ORIGIN"] = "https://zhauap-git-main-myteam.vercel.app"
    assert client.post("/api/register", json={"email": "pv@example.com", "password": PASSWORD}).status_code == 201
    client.environ_base["HTTP_ORIGIN"] = "https://zhauap-git-main-otherteam.vercel.app"
    assert client.post("/api/logout").status_code == 403


def test_proxied_requests_keep_client_ip_and_origin(client):
    # Через прокси Vercel запрос приходит с Origin сайта и X-Forwarded-For клиента.
    response = client.post(
        "/api/login",
        json={"email": "nobody@example.com", "password": "wrong1234"},
        headers={"X-Forwarded-For": "203.0.113.7, 76.76.21.21"},
    )
    assert response.status_code == 401
