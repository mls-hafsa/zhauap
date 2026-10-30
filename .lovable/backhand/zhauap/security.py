"""Авторизация, CSRF и общие помощники для маршрутов."""

from functools import wraps
from urllib.parse import urlparse

from bson import ObjectId
from bson.errors import InvalidId
from flask import current_app, g, jsonify, request, session

# Эти адреса вызываются не браузером владельца, а Telegram и планировщиком —
# у них своя проверка (секретный заголовок), cookie-сессия им не нужна.
CSRF_EXEMPT_PATHS = {"/api/telegram/webhook", "/api/internal/tick"}
STATE_CHANGING = {"POST", "PUT", "PATCH", "DELETE"}


def services():
    return current_app.extensions["zhauap"]


def error(message, status=400, **extra):
    payload = {"error": message}
    payload.update(extra)
    return jsonify(payload), status


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def parse_object_id(value):
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def request_origin():
    origin = request.headers.get("Origin")
    if origin and origin != "null":
        return origin
    referer = request.headers.get("Referer")
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"
    return None


def csrf_protect():
    """Запросы, меняющие данные, принимаются только с разрешённых сайтов.

    Cookie сессии отправляется браузером на любой запрос к API (SameSite=None),
    поэтому без этой проверки чужой сайт мог бы, например, загрузить CSV в каталог
    от имени вошедшего владельца. Браузеры всегда добавляют Origin к таким запросам.
    """
    if request.method not in STATE_CHANGING or not request.path.startswith("/api/"):
        return None
    if request.path in CSRF_EXEMPT_PATHS:
        return None
    config = services().config
    origin = request_origin()
    if origin is None:
        if config.is_production:
            return error("Запрос отклонён: не указан источник (Origin).", 403)
        return None
    if not config.is_allowed_origin(origin):
        return error("Запрос отклонён: недопустимый источник.", 403)
    return None


def start_session(user):
    session.clear()
    session.permanent = True
    session["company_id"] = user["company_id"]
    session["sv"] = int(user.get("session_version") or 0)


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        company_id = session.get("company_id")
        if not company_id:
            return error("Unauthorized. Пожалуйста, авторизуйтесь.", 401)
        user = services().store.users.find_one({"company_id": company_id})
        # session_version растёт при смене/сбросе пароля — старые сессии перестают работать.
        if not user or int(user.get("session_version") or 0) != int(session.get("sv") or 0):
            session.clear()
            return error("Сессия устарела. Войдите снова.", 401)
        g.user = user
        g.company_id = company_id
        return view(*args, **kwargs)

    return wrapper


def client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    return (forwarded.split(",")[0].strip() if forwarded else request.remote_addr) or "unknown"
