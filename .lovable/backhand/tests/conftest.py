import itertools
import os
import sys
from datetime import datetime, timedelta, timezone

import mongomock
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from zhauap import create_app  # noqa: E402
from zhauap.config import Config  # noqa: E402
from zhauap.db import Store  # noqa: E402
from zhauap.integrations.telegram import TelegramError  # noqa: E402

ORIGIN = "http://localhost:5173"
PASSWORD = "Secret123"


class FakeClock:
    def __init__(self):
        self.now = datetime.now(timezone.utc).replace(microsecond=0)

    def __call__(self):
        return self.now

    def advance(self, **kwargs):
        self.now += timedelta(**kwargs)


class FakeTelegram:
    def __init__(self):
        self.sent = []
        self.photos = []
        self.fail = False
        self.files = {"file-1": b"\xff\xd8receipt"}

    def send_message(self, chat_id, text, reply_to_message_id=None):
        if self.fail:
            raise TelegramError("Forbidden: bot was blocked by the user", 403)
        self.sent.append((chat_id, text))
        return {"message_id": len(self.sent)}

    def send_photo(self, chat_id, photo_bytes, caption=None, mime_type="image/png"):
        self.photos.append((chat_id, caption, mime_type))
        return {}

    def get_file_path(self, file_id):
        if file_id not in self.files:
            raise TelegramError("file not found")
        return f"photos/{file_id}.jpg"

    def download_file(self, file_path):
        return self.files[file_path.split("/")[-1].rsplit(".", 1)[0]]

    def texts_to(self, chat_id):
        return [text for cid, text in self.sent if cid == chat_id]


class FakeGemini:
    """Отдаёт заранее заданные ответы по очереди; None = модель недоступна."""

    configured = True

    def __init__(self):
        self.responses = []
        self.calls = []
        self.before_return = None

    def push(self, **reply):
        reply.setdefault("items", [])
        reply.setdefault("wants_payment", False)
        reply.setdefault("needs_human", False)
        self.responses.append(reply)

    def generate_json(self, system_text, contents, temperature=0.2):
        self.calls.append({"system": system_text, "contents": contents})
        if self.before_return:
            hook, self.before_return = self.before_return, None
            hook()
        if not self.responses:
            return None, None
        response = self.responses.pop(0)
        return (response, "fake-model") if response is not None else (None, None)


@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def telegram():
    return FakeTelegram()


@pytest.fixture
def gemini():
    return FakeGemini()


@pytest.fixture
def store():
    return Store(mongomock.MongoClient(tz_aware=True)["zhauap_test"])


@pytest.fixture
def config(tmp_path):
    return Config(
        env={},
        testing=True,
        secret_key="test-secret",
        telegram_webhook_secret="hook-secret",
        internal_tick_token="tick-token",
        receipts_dir=str(tmp_path / "receipts"),
    )


@pytest.fixture
def app(config, store, telegram, gemini, clock):
    return create_app(config, store=store, telegram=telegram, gemini=gemini, clock=clock)


@pytest.fixture
def svc(app):
    return app.extensions["zhauap"]


def make_client(app):
    client = app.test_client()
    client.environ_base["HTTP_ORIGIN"] = ORIGIN
    return client


@pytest.fixture
def client(app):
    return make_client(app)


_emails = itertools.count(1)


def register(client, email=None, business_name="Тестовая кофейня"):
    email = email or f"owner{next(_emails)}@example.com"
    response = client.post(
        "/api/register", json={"email": email, "password": PASSWORD, "business_name": business_name}
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()


@pytest.fixture
def owner(client):
    """Зарегистрированный владелец с активной сессией в client."""
    return register(client)


_update_ids = itertools.count(1000)


def tg_update(telegram_id=111, text=None, username="aidana_kz", first_name="Айдана", **extra):
    message = {
        "message_id": next(_update_ids),
        "chat": {"id": telegram_id, "type": "private"},
        "from": {"id": telegram_id, "is_bot": False, "first_name": first_name, "username": username},
    }
    if text is not None:
        message["text"] = text
    message.update(extra)
    return {"update_id": next(_update_ids), "message": message}


def post_update(client, update, secret="hook-secret"):
    return client.post(
        "/api/telegram/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": secret}
    )


def start_chat(client, company_id, telegram_id=111, username="aidana_kz"):
    response = post_update(client, tg_update(telegram_id, f"/start {company_id}", username=username))
    assert response.status_code == 200
