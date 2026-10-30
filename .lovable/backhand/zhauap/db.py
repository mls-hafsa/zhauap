"""Доступ к MongoDB: коллекции и индексы.

Схема данных расширяется только добавлением полей. Старые документы без новых
полей продолжают читаться — массовая миграция не нужна.
"""

import logging

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

log = logging.getLogger(__name__)


class Store:
    def __init__(self, db):
        self.db = db
        self.users = db["users"]
        # Исторически называется leads, но хранит сообщения диалогов:
        # одна запись = реплика клиента и/или ответ бота/владельца.
        self.leads = db["leads"]
        self.knowledge_base = db["knowledge_base"]
        self.services = db["services"]
        self.conversations = db["conversations"]
        self.payments = db["payments"]
        self.user_sessions = db["user_sessions"]
        self.processed_updates = db["processed_updates"]
        self.auth_attempts = db["auth_attempts"]

    @classmethod
    def from_uri(cls, uri, db_name):
        options = {"tz_aware": True}
        if "serverSelectionTimeoutMS" not in (uri or ""):
            options["serverSelectionTimeoutMS"] = 8000
        client = MongoClient(uri, **options)
        return cls(client[db_name])

    def ping(self):
        try:
            self.db.command("ping")
            return True
        except Exception:  # noqa: BLE001 — для health-check важен только факт
            return False

    def ensure_indexes(self):
        """Идемпотентно создаёт индексы. Ошибка одного индекса не роняет сервер."""
        specs = [
            (self.users, [("email", ASCENDING)], {"unique": True, "name": "email_unique"}),
            (self.users, [("company_id", ASCENDING)], {"name": "company_id"}),
            (self.users, [("owner_telegram_id", ASCENDING)], {"name": "owner_telegram_id", "sparse": True}),
            (self.leads, [("company_id", ASCENDING), ("created_at", DESCENDING)], {"name": "company_created"}),
            (
                self.leads,
                [("company_id", ASCENDING), ("telegram_id", ASCENDING), ("created_at", DESCENDING)],
                {"name": "company_client_created"},
            ),
            (
                self.leads,
                [("company_id", ASCENDING), ("contact", ASCENDING), ("created_at", DESCENDING)],
                {"name": "company_contact_created"},
            ),
            (
                self.conversations,
                [("company_id", ASCENDING), ("telegram_id", ASCENDING)],
                {
                    "name": "company_client_unique",
                    "unique": True,
                    "partialFilterExpression": {"telegram_id": {"$exists": True}},
                },
            ),
            (self.conversations, [("mode", ASCENDING), ("resume_at", ASCENDING)], {"name": "mode_resume_at"}),
            (self.services, [("company_id", ASCENDING), ("name_norm", ASCENDING)], {"name": "company_name_norm"}),
            (
                self.knowledge_base,
                [("company_id", ASCENDING), ("question_norm", ASCENDING)],
                {"name": "company_question_norm"},
            ),
            (
                self.payments,
                [("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)],
                {"name": "company_status_created"},
            ),
            (self.user_sessions, [("telegram_id", ASCENDING)], {"name": "telegram_id"}),
            (self.processed_updates, [("update_id", ASCENDING)], {"unique": True, "name": "update_id_unique"}),
            # Записи об обработанных апдейтах живут 3 дня — Telegram столько не ретраит.
            (self.processed_updates, [("created_at", ASCENDING)], {"expireAfterSeconds": 3 * 24 * 3600, "name": "ttl"}),
            (self.auth_attempts, [("key", ASCENDING), ("created_at", DESCENDING)], {"name": "key_created"}),
            (self.auth_attempts, [("created_at", ASCENDING)], {"expireAfterSeconds": 24 * 3600, "name": "ttl"}),
        ]
        for collection, keys, options in specs:
            try:
                collection.create_index(keys, **options)
            except (ConnectionFailure, ServerSelectionTimeoutError) as exc:
                log.warning("MongoDB недоступна, индексы будут созданы при следующем старте: %s", exc)
                return
            except Exception as exc:  # noqa: BLE001
                log.warning("Не удалось создать индекс %s.%s: %s", collection.name, options.get("name"), exc)
