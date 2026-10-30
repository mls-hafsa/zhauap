"""Аккаунты владельцев: пароли, лимит попыток, одноразовые коды.

Одноразовые коды хранятся только в виде SHA-256 хеша, со сроком жизни и
лимитом попыток. Сам код показывается владельцу один раз.
"""

import re
import secrets
from datetime import timedelta

import bcrypt

from ..utils import as_utc, hash_secret, secrets_equal, utcnow

PASSWORD_MIN = 8
PASSWORD_MAX = 128

LOGIN_WINDOW = timedelta(minutes=15)
LOGIN_MAX_FAILURES = 10

OWNER_LINK_TTL = timedelta(minutes=15)
OWNER_LINK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # без похожих 0/O, 1/I
OWNER_LINK_LENGTH = 8
OWNER_LINK_RE = re.compile(rf"^[{OWNER_LINK_ALPHABET}]{{{OWNER_LINK_LENGTH}}}$")

RESET_TTL = timedelta(minutes=15)
RESET_MAX_ATTEMPTS = 5
RESET_RESEND_INTERVAL = timedelta(seconds=60)


class PolicyError(ValueError):
    pass


def check_password_policy(password):
    if not isinstance(password, str) or len(password) < PASSWORD_MIN:
        raise PolicyError(f"Пароль должен быть не короче {PASSWORD_MIN} символов")
    if len(password) > PASSWORD_MAX:
        raise PolicyError(f"Пароль должен быть не длиннее {PASSWORD_MAX} символов")
    if not re.search(r"[A-Za-zА-Яа-яЁё]", password) or not re.search(r"\d", password):
        raise PolicyError("Пароль должен содержать хотя бы одну букву и одну цифру")


def hash_password(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())


def check_password(password, hashed):
    if not hashed or not isinstance(password, str):
        return False
    if isinstance(hashed, str):
        hashed = hashed.encode("utf-8")
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed)
    except ValueError:
        return False


# ---------------- лимит попыток входа ----------------


def too_many_failures(store, key):
    since = utcnow() - LOGIN_WINDOW
    return store.auth_attempts.count_documents({"key": key, "created_at": {"$gte": since}}) >= LOGIN_MAX_FAILURES


def record_failure(store, key):
    store.auth_attempts.insert_one({"key": key, "created_at": utcnow()})


def clear_failures(store, key):
    store.auth_attempts.delete_many({"key": key})


# ---------------- привязка Telegram владельца ----------------


def create_owner_link_code(store, company_id):
    code = "".join(secrets.choice(OWNER_LINK_ALPHABET) for _ in range(OWNER_LINK_LENGTH))
    expires_at = utcnow() + OWNER_LINK_TTL
    store.users.update_one(
        {"company_id": company_id},
        {"$set": {"owner_link": {"code_hash": hash_secret(code), "expires_at": expires_at}}},
    )
    return code, expires_at


def consume_owner_link_code(store, code, telegram_id):
    """Привязывает Telegram владельца по коду. Возвращает пользователя или None."""
    code = (code or "").strip().upper()
    if not OWNER_LINK_RE.match(code):
        return None
    code_hash = hash_secret(code)
    user = store.users.find_one({"owner_link.code_hash": code_hash})
    if not user:
        return None
    expires_at = as_utc((user.get("owner_link") or {}).get("expires_at"))
    if expires_at is None or utcnow() > expires_at:
        store.users.update_one({"_id": user["_id"]}, {"$unset": {"owner_link": ""}})
        return None
    # Одноразовость: снимаем код атомарно вместе с привязкой.
    result = store.users.update_one(
        {"_id": user["_id"], "owner_link.code_hash": code_hash},
        {
            "$set": {"owner_telegram_id": telegram_id, "owner_linked_at": utcnow()},
            "$unset": {"owner_link": ""},
        },
    )
    if result.modified_count != 1:
        return None
    user["owner_telegram_id"] = telegram_id
    return user


# ---------------- сброс пароля через Telegram ----------------


def start_password_reset(store, user):
    """Создаёт 6-значный код. Возвращает код или None, если запрошен слишком часто."""
    reset = user.get("password_reset") or {}
    last = as_utc(reset.get("created_at"))
    if last and utcnow() - last < RESET_RESEND_INTERVAL:
        return None
    code = f"{secrets.randbelow(1_000_000):06d}"
    store.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_reset": {
                    "code_hash": hash_secret(code),
                    "expires_at": utcnow() + RESET_TTL,
                    "attempts": 0,
                    "created_at": utcnow(),
                }
            }
        },
    )
    return code


def verify_password_reset(store, user, code):
    reset = user.get("password_reset") or {}
    expires_at = as_utc(reset.get("expires_at"))
    if not reset.get("code_hash") or expires_at is None or utcnow() > expires_at:
        return False
    if int(reset.get("attempts") or 0) >= RESET_MAX_ATTEMPTS:
        return False
    if secrets_equal(reset["code_hash"], hash_secret((code or "").strip())):
        return True
    store.users.update_one({"_id": user["_id"]}, {"$inc": {"password_reset.attempts": 1}})
    return False


def set_password(store, user, new_password):
    """Меняет пароль и инвалидирует все текущие сессии (session_version + 1)."""
    store.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {"password": hash_password(new_password), "password_changed_at": utcnow()},
            "$unset": {"password_reset": ""},
            "$inc": {"session_version": 1},
        },
    )
