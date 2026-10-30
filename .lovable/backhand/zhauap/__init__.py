"""Фабрика Flask-приложения Zhauap."""

import logging
import threading
from dataclasses import dataclass
from datetime import timedelta

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge

from .config import LOCALHOST_ORIGIN_RE, Config
from .db import Store
from .integrations.gemini import GeminiClient
from .integrations.telegram import TelegramClient, TelegramError
from .security import csrf_protect
from .services.assistant import Assistant, background_ticker
from .services.conversations import ConversationService

log = logging.getLogger("zhauap")

MAX_REQUEST_BYTES = 6 * 1024 * 1024  # QR-картинка в base64 + запас


@dataclass
class AppServices:
    config: Config
    store: Store
    telegram: object
    gemini: GeminiClient
    conversations: ConversationService
    assistant: Assistant
    stop_event: threading.Event


def create_app(config=None, store=None, telegram=None, gemini=None, clock=None):
    config = config or Config()
    if not config.testing:
        config.validate()
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    app = Flask(__name__)
    app.secret_key = config.secret_key
    app.config.update(
        SESSION_COOKIE_SAMESITE=config.cookie_samesite,
        SESSION_COOKIE_SECURE=config.cookie_secure,
        SESSION_COOKIE_HTTPONLY=True,
        PERMANENT_SESSION_LIFETIME=timedelta(days=config.session_days),
        MAX_CONTENT_LENGTH=MAX_REQUEST_BYTES,
        JSON_AS_ASCII=False,
        TESTING=config.testing,
    )
    app.json.ensure_ascii = False

    origins = list(config.frontend_origins)
    if config.allow_localhost_origins:
        origins.append(LOCALHOST_ORIGIN_RE)
    CORS(app, supports_credentials=True, origins=origins)

    if store is None:
        store = Store.from_uri(config.mongo_uri, config.db_name)
    try:
        store.ensure_indexes()
    except Exception as exc:  # noqa: BLE001 — без индексов работаем медленнее, но работаем
        log.warning("Индексы не созданы: %s", exc)

    if telegram is None and config.telegram_token:
        telegram = TelegramClient(config.telegram_token)
    if gemini is None:
        gemini = GeminiClient(
            config.gemini_api_key,
            config.gemini_models,
            timeout=config.gemini_timeout_seconds,
            deadline=config.gemini_deadline_seconds,
        )

    conv_kwargs = {"timeout_minutes": config.manual_timeout_minutes}
    asst_kwargs = {}
    if clock is not None:
        conv_kwargs["clock"] = clock
        asst_kwargs["clock"] = clock
    conversations = ConversationService(store, **conv_kwargs)
    assistant = Assistant(store, telegram, gemini, conversations, config, **asst_kwargs)
    app.extensions["zhauap"] = AppServices(
        config=config,
        store=store,
        telegram=telegram,
        gemini=gemini,
        conversations=conversations,
        assistant=assistant,
        stop_event=threading.Event(),
    )

    app.before_request(csrf_protect)
    _register_blueprints(app)
    _register_error_handlers(app)

    if not config.testing:
        if not config.telegram_webhook_secret:
            log.warning("TELEGRAM_WEBHOOK_SECRET не задан — webhook не защищён от поддельных запросов!")
        if not config.gemini_api_key:
            log.warning("GEMINI_API_KEY не задан — AI-ответы работать не будут.")
        _configure_webhook(config, telegram)
        if config.enable_background_tick:
            thread = threading.Thread(
                target=background_ticker,
                args=(assistant, config.tick_interval_seconds, app.extensions["zhauap"].stop_event),
                name="zhauap-resume-ticker",
                daemon=True,
            )
            thread.start()
    return app


def _register_blueprints(app):
    from .routes import auth, catalog, conversations, payments, settings, system

    for module in (system, auth, conversations, catalog, payments, settings):
        app.register_blueprint(module.bp)


def _register_error_handlers(app):
    @app.errorhandler(RequestEntityTooLarge)
    def too_large(_exc):
        return jsonify({"error": "Слишком большой запрос или файл."}), 413

    @app.errorhandler(HTTPException)
    def http_error(exc):
        if request.path.startswith("/api/"):
            return jsonify({"error": exc.description or exc.name}), exc.code
        return exc

    @app.errorhandler(Exception)
    def unhandled(exc):
        log.exception("Необработанная ошибка %s %s", request.method, request.path)
        return jsonify({"error": "Внутренняя ошибка сервера. Попробуйте ещё раз."}), 500


def _configure_webhook(config, telegram):
    """Регистрирует webhook при старте на Render. Без RENDER_EXTERNAL_URL (локально) — пропуск."""
    if not config.public_base_url or not telegram:
        log.info("Webhook не настраивается: нет RENDER_EXTERNAL_URL/PUBLIC_BASE_URL или TELEGRAM_TOKEN.")
        return
    url = f"{config.public_base_url.rstrip('/')}/api/telegram/webhook"
    try:
        telegram.set_webhook(url, config.telegram_webhook_secret)
        log.info("Telegram webhook настроен: %s", url)
    except TelegramError as exc:
        log.warning("Telegram отклонил setWebhook: %s", exc)
