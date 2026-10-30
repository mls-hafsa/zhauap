"""Регистрация, вход, выход, сброс и смена пароля."""

import logging
from datetime import timedelta

from flask import Blueprint, g, jsonify, session
from pymongo.errors import DuplicateKeyError

from ..security import client_ip, error, json_body, login_required, services, start_session
from ..services import accounts
from ..utils import EMAIL_RE, as_utc, clip, new_company_id, utcnow

log = logging.getLogger(__name__)
bp = Blueprint("auth", __name__)

IP_MAX_FAILURES = 50


def trial_info(user, trial_days):
    started = as_utc(user.get("trial_started_at"))
    if not started:
        return {"trial_days_left": trial_days, "trial_active": True}
    end = started + timedelta(days=trial_days)
    left = max(0, (end - utcnow()).days)
    return {"trial_days_left": left, "trial_active": left > 0}


def account_payload(user):
    config = services().config
    company_id = user["company_id"]
    profile = user.get("business_profile") or {}
    return {
        "email": user.get("email", ""),
        "company_id": company_id,
        "business_name": user.get("business_name", ""),
        "telegram_link": f"https://t.me/{config.bot_username}?start={company_id}",
        "bot_username": config.bot_username,
        "owner_telegram_linked": bool(user.get("owner_telegram_id")),
        "onboarding_completed": bool(profile.get("onboarding_completed")),
        **trial_info(user, config.trial_days),
    }


def _email(data):
    return clip(data.get("email"), 254).lower()


@bp.post("/api/register")
def register():
    store = services().store
    data = json_body()
    email = _email(data)
    password = data.get("password") or ""
    business_name = clip(data.get("business_name"), 100) or "Мой бизнес"

    if not email or not password:
        return error("Заполните все поля!")
    if not EMAIL_RE.match(email):
        return error("Введите корректный email")
    try:
        accounts.check_password_policy(password)
    except accounts.PolicyError as exc:
        return error(str(exc))
    if store.users.find_one({"email": email}):
        return error("Такой email уже зарегистрирован!")

    now = utcnow()
    user = {
        "email": email,
        "password": accounts.hash_password(password),
        "business_name": business_name,
        "company_id": new_company_id(),
        "trial_started_at": now,
        "created_at": now,
        "session_version": 0,
    }
    try:
        user["_id"] = store.users.insert_one(user).inserted_id
    except DuplicateKeyError:
        return error("Такой email уже зарегистрирован!")
    start_session(user)
    return jsonify({"message": "Регистрация успешна!", **account_payload(user)}), 201


@bp.post("/api/login")
def login():
    store = services().store
    data = json_body()
    email = _email(data)
    password = data.get("password") or ""
    if not email or not password:
        return error("Введите email и пароль!")

    email_key, ip_key = f"login:{email}", f"ip:{client_ip()}"
    if accounts.too_many_failures(store, email_key) or (
        store.auth_attempts.count_documents({"key": ip_key, "created_at": {"$gte": utcnow() - accounts.LOGIN_WINDOW}})
        >= IP_MAX_FAILURES
    ):
        return error("Слишком много неудачных попыток. Попробуйте через 15 минут.", 429)

    user = store.users.find_one({"email": email})
    if not user or not accounts.check_password(password, user.get("password")):
        accounts.record_failure(store, email_key)
        accounts.record_failure(store, ip_key)
        return error("Неверный email или пароль!", 401)
    accounts.clear_failures(store, email_key)

    fixes = {}
    if not user.get("company_id"):
        fixes["company_id"] = new_company_id()
    if not user.get("trial_started_at"):
        fixes["trial_started_at"] = utcnow()
    if fixes:
        store.users.update_one({"_id": user["_id"]}, {"$set": fixes})
        user.update(fixes)

    start_session(user)
    return jsonify({"message": "Вход выполнен успешно!", **account_payload(user)}), 200


@bp.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"message": "Вы вышли из аккаунта"}), 200


@bp.get("/api/me")
@login_required
def me():
    return jsonify(account_payload(g.user)), 200


@bp.post("/api/auth/forgot")
def forgot_password():
    """Сброс пароля через привязанный Telegram владельца (почтовый сервис не подключён).
    Ответ одинаковый для любых email, чтобы нельзя было проверить, кто зарегистрирован."""
    svc = services()
    data = json_body()
    email = _email(data)
    generic = {
        "message": (
            "Если аккаунт с таким email существует и к нему привязан Telegram владельца, "
            f"код для сброса отправлен в бот @{svc.config.bot_username}."
        )
    }
    if not email or not EMAIL_RE.match(email):
        return error("Введите корректный email")
    ip_key = f"forgot:{client_ip()}"
    if accounts.too_many_failures(svc.store, ip_key):
        return error("Слишком много запросов. Попробуйте позже.", 429)
    accounts.record_failure(svc.store, ip_key)

    user = svc.store.users.find_one({"email": email})
    if user and user.get("owner_telegram_id") and svc.telegram:
        code = accounts.start_password_reset(svc.store, user)
        if code:
            svc.assistant._send(  # noqa: SLF001 — тот же канал, что и уведомления владельцу
                user["owner_telegram_id"],
                f"🔐 Код для сброса пароля Zhauap: {code}\nОн действует 15 минут. "
                "Если вы не запрашивали сброс — просто проигнорируйте это сообщение.",
            )
    return jsonify(generic), 200


@bp.post("/api/auth/reset")
def reset_password():
    store = services().store
    data = json_body()
    email = _email(data)
    code = clip(data.get("code"), 12)
    password = data.get("password") or ""
    try:
        accounts.check_password_policy(password)
    except accounts.PolicyError as exc:
        return error(str(exc))
    user = store.users.find_one({"email": email}) if email else None
    if not user or not accounts.verify_password_reset(store, user, code):
        return error("Код неверный или устарел. Запросите новый.")
    accounts.set_password(store, user, password)
    accounts.clear_failures(store, f"login:{email}")
    return jsonify({"message": "Пароль изменён. Войдите с новым паролем."}), 200


@bp.post("/api/account/password")
@login_required
def change_password():
    store = services().store
    data = json_body()
    if not accounts.check_password(data.get("current_password") or "", g.user.get("password")):
        return error("Текущий пароль указан неверно")
    new_password = data.get("new_password") or ""
    try:
        accounts.check_password_policy(new_password)
    except accounts.PolicyError as exc:
        return error(str(exc))
    accounts.set_password(store, g.user, new_password)
    # Остальные сессии завершены; текущую сохраняем с новой версией.
    start_session(store.users.find_one({"_id": g.user["_id"]}))
    return jsonify({"message": "Пароль изменён. На других устройствах нужно будет войти заново."}), 200
