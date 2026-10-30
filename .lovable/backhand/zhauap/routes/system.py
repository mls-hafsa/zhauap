"""Health-check, Telegram webhook и внутренний тик таймера."""

import logging

from flask import Blueprint, jsonify, request

from ..security import error, services
from ..utils import iso, secrets_equal

log = logging.getLogger(__name__)
bp = Blueprint("system", __name__)


@bp.get("/api/health")
def health():
    svc = services()
    # Пинги uptime-сервисов заодно будят обработку просроченных диалогов.
    svc.assistant.maybe_tick()
    return jsonify(
        {
            "ok": True,
            "api": "zhauap",
            "db_ok": svc.store.ping(),
            "telegram_configured": svc.telegram is not None,
            "gemini_configured": svc.gemini.configured,
            # null — нормально, если клиенты давно не писали; это не признак поломки.
            "telegram_last_update_at": iso(svc.assistant.last_update_at),
        }
    ), 200


@bp.post("/api/telegram/webhook")
def telegram_webhook():
    svc = services()
    secret = svc.config.telegram_webhook_secret
    if secret and not secrets_equal(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), secret):
        return error("Forbidden", 403)
    update = request.get_json(silent=True)
    status = svc.assistant.process_update(update)
    if status not in ("duplicate", "ignored"):
        svc.assistant.maybe_tick()
    # Всегда 200: иначе Telegram будет бесконечно повторять один и тот же апдейт.
    return jsonify({"ok": True, "status": status}), 200


@bp.route("/api/internal/tick", methods=["POST", "GET"])
def internal_tick():
    """Вызывается внешним планировщиком (например cron-job.org) раз в минуту.
    Возвращает AI диалоги, где владелец не ответил вовремя. Защищён токеном."""
    svc = services()
    token = svc.config.internal_tick_token
    provided = request.headers.get("X-Internal-Token") or ""
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        provided = auth[7:].strip()
    if not token:
        return error("Not found", 404)
    if not secrets_equal(provided, token):
        return error("Forbidden", 403)
    handled = svc.assistant.run_due_resumes()
    return jsonify({"ok": True, "resumed": handled}), 200
