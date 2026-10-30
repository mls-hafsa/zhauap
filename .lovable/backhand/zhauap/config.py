"""Настройки backend из переменных окружения.

Все секреты берутся только из окружения. Значения по умолчанию подобраны так,
чтобы локальный запуск работал без лишней настройки, а production — безопасно.
"""

import os
import re


def _bool(env, name, default):
    raw = env.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(env, name, default, minimum=None):
    raw = env.get(name)
    try:
        value = int(raw) if raw not in (None, "") else default
    except ValueError:
        value = default
    if minimum is not None:
        value = max(minimum, value)
    return value


def _list(env, name, default):
    raw = env.get(name)
    if raw is None or raw.strip() == "":
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


DEFAULT_GEMINI_MODELS = ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash-lite"]
DEFAULT_FRONTEND_ORIGINS = ["https://zhauap.vercel.app"]
LOCALHOST_ORIGIN_RE = re.compile(r"^http://(localhost|127\.0\.0\.1):\d+$")


class Config:
    def __init__(self, env=None, **overrides):
        env = dict(os.environ if env is None else env)

        self.is_production = env.get("RENDER") is not None or env.get("ZHAUAP_ENV") == "production"
        self.testing = False

        self.secret_key = env.get("FLASK_SECRET_KEY")
        self.mongo_uri = env.get("MONGO_URI")
        self.db_name = env.get("MONGO_DB_NAME", "zhauap_database")

        self.telegram_token = env.get("TELEGRAM_TOKEN")
        self.telegram_webhook_secret = env.get("TELEGRAM_WEBHOOK_SECRET")
        self.bot_username = env.get("BOT_USERNAME", "zhauapai_bot").lstrip("@")
        self.public_base_url = env.get("RENDER_EXTERNAL_URL") or env.get("PUBLIC_BASE_URL")

        self.gemini_api_key = env.get("GEMINI_API_KEY")
        self.gemini_models = _list(env, "GEMINI_MODELS", DEFAULT_GEMINI_MODELS)
        self.gemini_timeout_seconds = _int(env, "GEMINI_TIMEOUT_SECONDS", 15, minimum=3)
        # Общий бюджет времени на один ответ AI, чтобы webhook не висел минутами
        # и Telegram не начинал повторную доставку того же сообщения.
        self.gemini_deadline_seconds = _int(env, "GEMINI_DEADLINE_SECONDS", 35, minimum=5)

        self.frontend_origins = _list(env, "FRONTEND_ORIGINS", DEFAULT_FRONTEND_ORIGINS)
        self.allow_localhost_origins = _bool(env, "ALLOW_LOCALHOST_ORIGINS", not self.is_production)
        # Пока frontend (Vercel) и API (Render) на разных доменах, cookie должен
        # быть SameSite=None. Если API проксируется через домен сайта, можно
        # поставить Lax.
        self.cookie_samesite = env.get("SESSION_COOKIE_SAMESITE") or ("None" if self.is_production else "Lax")
        self.cookie_secure = _bool(env, "SESSION_COOKIE_SECURE", self.is_production)
        self.session_days = _int(env, "SESSION_DAYS", 30, minimum=1)

        self.manual_timeout_minutes = _int(env, "MANUAL_TIMEOUT_MINUTES", 10, minimum=1)
        self.enable_background_tick = _bool(env, "ENABLE_BACKGROUND_TICK", True)
        self.tick_interval_seconds = _int(env, "TICK_INTERVAL_SECONDS", 30, minimum=5)
        self.internal_tick_token = env.get("INTERNAL_TICK_TOKEN")

        self.receipts_dir = env.get("RECEIPTS_DIR", "receipts")
        self.trial_days = _int(env, "TRIAL_DAYS", 14, minimum=0)

        for key, value in overrides.items():
            setattr(self, key, value)

    def is_allowed_origin(self, origin):
        if not origin:
            return False
        origin = origin.rstrip("/")
        if origin in self.frontend_origins:
            return True
        return bool(self.allow_localhost_origins and LOCALHOST_ORIGIN_RE.match(origin))

    def validate(self):
        """Падаем при старте, если без значения работать небезопасно."""
        if not self.secret_key:
            raise RuntimeError(
                "FLASK_SECRET_KEY не задан! Сгенерируй ключ: "
                "python -c \"import secrets; print(secrets.token_hex(32))\" "
                "и добавь его в Render -> Environment."
            )
        if self.is_production and not self.mongo_uri:
            raise RuntimeError("MONGO_URI не задан в переменных окружения Render.")
