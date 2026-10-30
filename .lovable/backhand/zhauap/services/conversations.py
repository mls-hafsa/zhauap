"""Состояние диалога: кто сейчас отвечает клиенту — бот или владелец.

Документ conversations (ключ company_id + telegram_id):
- mode: "bot" | "manual"
- manual_reason: "owner_takeover" | "owner_reply" | "ai_handoff" | "client_request"
- handoff_reason: почему AI позвал владельца (для владельца)
- resume_at: когда AI заберёт диалог обратно, если владелец молчит (хранится в БД,
  поэтому переживает перезапуск сервера)
- awaiting_since: время самого раннего неотвеченного сообщения клиента в ручном режиме
- version: увеличивается при каждой смене режима и каждом ответе владельца.
  Отправитель (AI) запоминает версию до генерации ответа и отправляет его, только
  если версия не изменилась — так AI не перебьёт владельца устаревшим ответом.

Правила таймера (MANUAL_TIMEOUT_MINUTES, по умолчанию 10):
- перехват/передача владельцу/ответ владельца -> resume_at = сейчас + 10 мин;
- новое сообщение клиента в ручном режиме, если он ещё ничего не ждал ->
  resume_at = max(resume_at, сейчас + 10 мин): у владельца есть 10 минут на ответ;
- когда resume_at прошёл, фоновая задача атомарно возвращает режим bot и,
  если клиент ждёт ответа, AI отвечает на неотвеченные сообщения.
"""

from datetime import timedelta

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from ..utils import as_utc, utcnow

MANUAL_REASONS = {"owner_takeover", "owner_reply", "ai_handoff", "client_request"}


class ConversationService:
    def __init__(self, store, timeout_minutes=10, clock=utcnow):
        self.store = store
        self.timeout = timedelta(minutes=timeout_minutes)
        self.clock = clock

    # ---------------- чтение ----------------

    def get(self, company_id, telegram_id=None, contact=None):
        coll = self.store.conversations
        if telegram_id is not None:
            doc = coll.find_one({"company_id": company_id, "telegram_id": telegram_id})
            if doc:
                return doc
            if contact:
                # Старые документы хранились только по contact — подхватываем их.
                legacy = coll.find_one(
                    {"company_id": company_id, "contact": contact, "telegram_id": {"$exists": False}}
                )
                if legacy:
                    try:
                        coll.update_one({"_id": legacy["_id"]}, {"$set": {"telegram_id": telegram_id}})
                        legacy["telegram_id"] = telegram_id
                    except DuplicateKeyError:
                        return coll.find_one({"company_id": company_id, "telegram_id": telegram_id})
                    return legacy
            return None
        if contact:
            return coll.find_one({"company_id": company_id, "contact": contact})
        return None

    def ensure(self, company_id, telegram_id, contact=None, name=None):
        """Создаёт документ диалога, если его нет; обновляет отображаемые контакт и имя."""
        existing = self.get(company_id, telegram_id, contact)
        now = self.clock()
        # Новое сообщение клиента возвращает архивированный диалог во «Входящие».
        updates = {"updated_at": now, "archived": False}
        if contact:
            updates["contact"] = contact
        if name:
            updates["name"] = name
        if existing:
            self.store.conversations.update_one({"_id": existing["_id"]}, {"$set": updates})
            existing.update(updates)
            return existing
        doc = {
            "company_id": company_id,
            "telegram_id": telegram_id,
            "mode": "bot",
            "version": 0,
            "created_at": now,
            **updates,
        }
        try:
            result = self.store.conversations.insert_one(doc)
            doc["_id"] = result.inserted_id
            return doc
        except DuplicateKeyError:
            return self.get(company_id, telegram_id)

    @staticmethod
    def version(doc):
        return int((doc or {}).get("version") or 0)

    def is_current(self, conv_id, version):
        doc = self.store.conversations.find_one({"_id": conv_id}, {"version": 1})
        return doc is not None and self.version(doc) == version

    def effective_mode(self, doc):
        """Режим с учётом просроченного таймера (без записи в базу)."""
        if not doc or doc.get("mode") != "manual":
            return "bot"
        resume_at = as_utc(doc.get("resume_at"))
        if resume_at is None:
            # Старые документы без resume_at: считаем от manual_since, как раньше.
            since = as_utc(doc.get("manual_since"))
            if since is None or self.clock() >= since + self.timeout:
                return "expired"
            return "manual"
        return "expired" if self.clock() >= resume_at else "manual"

    # ---------------- переходы ----------------

    def _manual_update(self, reason, handoff_reason=None, awaiting=False, extra=None):
        now = self.clock()
        update = {
            "$set": {
                "mode": "manual",
                "manual_reason": reason,
                "manual_since": now,
                "resume_at": now + self.timeout,
                "updated_at": now,
                "archived": False,
            },
            "$inc": {"version": 1},
        }
        if handoff_reason is not None:
            update["$set"]["handoff_reason"] = handoff_reason
        if awaiting:
            update["$set"]["awaiting_since"] = now
        if extra:
            update["$set"].update(extra)
        return update

    def take_over(self, conv, reason, handoff_reason=None, awaiting=False):
        """Перевести диалог владельцу (перехват, эскалация AI, просьба клиента)."""
        if reason not in MANUAL_REASONS:
            raise ValueError(reason)
        update = self._manual_update(reason, handoff_reason, awaiting)
        return self.store.conversations.find_one_and_update(
            {"_id": conv["_id"]}, update, return_document=ReturnDocument.AFTER
        )

    def register_owner_reply(self, conv):
        """Владелец ответил: клиент больше не ждёт, у владельца снова 10 минут."""
        now = self.clock()
        update = self._manual_update("owner_reply", extra={"last_owner_reply_at": now})
        update["$unset"] = {"awaiting_since": ""}
        return self.store.conversations.find_one_and_update(
            {"_id": conv["_id"]}, update, return_document=ReturnDocument.AFTER
        )

    def register_waiting_client(self, conv):
        """Клиент написал в ручном режиме. Возвращает (doc, first_waiting)."""
        now = self.clock()
        deadline = now + self.timeout
        updated = self.store.conversations.find_one_and_update(
            {"_id": conv["_id"], "mode": "manual", "awaiting_since": {"$exists": False}},
            {"$set": {"awaiting_since": now, "updated_at": now, "archived": False}, "$max": {"resume_at": deadline}},
            return_document=ReturnDocument.AFTER,
        )
        if updated is not None:
            return updated, True
        doc = self.store.conversations.find_one_and_update(
            {"_id": conv["_id"]},
            {"$set": {"updated_at": now, "archived": False}},
            return_document=ReturnDocument.AFTER,
        )
        return doc, False

    def return_to_bot(self, conv, reason="owner"):
        now = self.clock()
        return self.store.conversations.find_one_and_update(
            {"_id": conv["_id"]},
            {
                "$set": {"mode": "bot", "updated_at": now, "returned_reason": reason},
                "$unset": {"manual_since": "", "resume_at": "", "manual_reason": "", "handoff_reason": ""},
                "$inc": {"version": 1},
            },
            return_document=ReturnDocument.AFTER,
        )

    def claim_resume(self, conv):
        """Атомарно забирает просроченный диалог у владельца. None — если кто-то успел раньше
        (владелец ответил, другой воркер уже обработал)."""
        now = self.clock()
        query = {"_id": conv["_id"], "mode": "manual", "version": conv.get("version", 0)}
        if conv.get("version") is None:
            query = {"_id": conv["_id"], "mode": "manual", "version": {"$exists": False}}
        claimed = self.store.conversations.find_one_and_update(
            query,
            {
                "$set": {"mode": "bot", "updated_at": now, "returned_reason": "timeout", "resumed_at": now},
                "$unset": {"manual_since": "", "resume_at": "", "manual_reason": "", "handoff_reason": ""},
                "$inc": {"version": 1},
            },
            return_document=ReturnDocument.AFTER,
        )
        return claimed

    def clear_awaiting(self, conv_id, version):
        """Снимает флаг ожидания, только если за это время никто не менял диалог."""
        self.store.conversations.update_one(
            {"_id": conv_id, "version": version}, {"$unset": {"awaiting_since": ""}}
        )

    def due(self, limit=50):
        now = self.clock()
        legacy_cutoff = now - self.timeout
        return list(
            self.store.conversations.find(
                {
                    "mode": "manual",
                    "$or": [
                        {"resume_at": {"$lte": now}},
                        {"resume_at": {"$exists": False}, "manual_since": {"$lte": legacy_cutoff}},
                    ],
                }
            ).limit(limit)
        )

    def archive(self, conv):
        self.store.conversations.update_one(
            {"_id": conv["_id"]}, {"$set": {"archived": True, "archived_at": self.clock()}}
        )
