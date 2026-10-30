"""Небольшие общие помощники без зависимостей от Flask."""

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timezone

COMPANY_ID_RE = re.compile(r"^comp_[0-9a-f]{8}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def utcnow():
    return datetime.now(timezone.utc)


def as_utc(value):
    """Приводит datetime/ISO-строку из базы к aware UTC (старые записи могли быть naive)."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def iso(value):
    value = as_utc(value)
    return value.isoformat() if value else None


def serialize_doc(doc, drop=()):
    """Готовит документ Mongo к JSON: ObjectId -> str, даты -> ISO."""
    if doc is None:
        return None
    out = {}
    for key, value in doc.items():
        if key in drop:
            continue
        if key == "_id":
            out[key] = str(value)
        elif isinstance(value, datetime):
            out[key] = iso(value)
        else:
            out[key] = value
    return out


def normalize_text(value):
    """Ключ для сравнения названий/вопросов: регистр, ё/е, пробелы, пунктуация по краям."""
    text = (value or "").casefold().replace("ё", "е")
    text = re.sub(r"\s+", " ", text).strip()
    return text.strip(" .,!?;:«»\"'()-")


def is_valid_company_id(value):
    return bool(value) and bool(COMPANY_ID_RE.match(value))


def new_company_id():
    return "comp_" + secrets.token_hex(4)


def hash_secret(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def secrets_equal(a, b):
    return hmac.compare_digest(a or "", b or "")


def clip(value, limit):
    value = "" if value is None else str(value)
    return value.strip()[:limit]


def client_key(telegram_id=None, contact=None):
    """Стабильный ключ диалога для URL и frontend: tg:<id> или c:<contact>."""
    if telegram_id is not None:
        return f"tg:{telegram_id}"
    return f"c:{contact or ''}"
