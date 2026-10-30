"""Настройки компании: реквизиты оплаты, профиль бизнеса, Telegram владельца."""

from flask import Blueprint, g, jsonify

from ..security import error, json_body, login_required, services
from ..services.accounts import create_owner_link_code
from ..services.assistant import parse_data_url
from ..utils import as_utc, clip, iso, utcnow

bp = Blueprint("settings", __name__)

PAYMENT_INFO_LIMIT = 2000
QR_MAX_BYTES = 2 * 1024 * 1024
PROFILE_FIELDS = {
    "business_type": 100,
    "about": 1000,
    "hours": 500,
    "address": 300,
    "phone": 50,
    "delivery": 1000,
    "conditions": 1000,
    "tone": 200,
}


@bp.get("/api/settings/payment")
@login_required
def get_payment_settings():
    return jsonify({"payment_info": g.user.get("payment_info", ""), "payment_qr": g.user.get("payment_qr", "")}), 200


@bp.patch("/api/settings/payment")
@login_required
def update_payment_settings():
    data = json_body()
    fields = {}
    if "payment_info" in data:
        info = clip(data["payment_info"], PAYMENT_INFO_LIMIT + 1)
        if len(info) > PAYMENT_INFO_LIMIT:
            return error(f"Реквизиты длиннее {PAYMENT_INFO_LIMIT} символов")
        fields["payment_info"] = info
    if "payment_qr" in data:
        qr = data["payment_qr"] or ""
        if qr:
            try:
                content, _mime = parse_data_url(qr)
            except ValueError:
                return error("QR-код должен быть картинкой PNG, JPEG или WEBP")
            if len(content) > QR_MAX_BYTES:
                return error("Картинка QR-кода больше 2 МБ — уменьшите её")
        fields["payment_qr"] = qr
    if not fields:
        return error("Нечего обновлять!")
    services().store.users.update_one({"company_id": g.company_id}, {"$set": fields})
    return jsonify({"message": "Реквизиты сохранены!"}), 200


@bp.get("/api/settings/business")
@login_required
def get_business():
    profile = g.user.get("business_profile") or {}
    return jsonify(
        {
            "business_name": g.user.get("business_name", ""),
            **{key: profile.get(key, "") for key in PROFILE_FIELDS},
            "onboarding_completed": bool(profile.get("onboarding_completed")),
        }
    ), 200


@bp.patch("/api/settings/business")
@login_required
def update_business():
    data = json_body()
    fields = {}
    if "business_name" in data:
        name = clip(data["business_name"], 101)
        if not name:
            return error("Название бизнеса не может быть пустым")
        if len(name) > 100:
            return error("Название бизнеса длиннее 100 символов")
        fields["business_name"] = name
    for key, limit in PROFILE_FIELDS.items():
        if key in data:
            value = clip(data[key], limit + 1)
            if len(value) > limit:
                return error(f"Поле «{key}» длиннее {limit} символов")
            fields[f"business_profile.{key}"] = value
    if "onboarding_completed" in data:
        fields["business_profile.onboarding_completed"] = bool(data["onboarding_completed"])
    if not fields:
        return error("Нечего обновлять!")
    fields["business_profile.updated_at"] = utcnow()
    services().store.users.update_one({"company_id": g.company_id}, {"$set": fields})
    return jsonify({"message": "Профиль бизнеса сохранён!"}), 200


def _telegram_state(user):
    config = services().config
    link = user.get("owner_link") or {}
    expires_at = as_utc(link.get("expires_at"))
    return {
        "bot_username": config.bot_username,
        "client_link": f"https://t.me/{config.bot_username}?start={user['company_id']}",
        "owner_linked": bool(user.get("owner_telegram_id")),
        "owner_linked_at": iso(user.get("owner_linked_at")),
        "link_code_active_until": iso(expires_at) if expires_at and expires_at > utcnow() else None,
        "bot_configured": services().telegram is not None,
    }


@bp.get("/api/settings/telegram")
@login_required
def get_telegram_settings():
    return jsonify(_telegram_state(g.user)), 200


@bp.post("/api/settings/telegram/link-code")
@login_required
def create_link_code():
    config = services().config
    code, expires_at = create_owner_link_code(services().store, g.company_id)
    return jsonify(
        {
            "code": code,
            "expires_at": iso(expires_at),
            "command": f"/owner {code}",
            "deep_link": f"https://t.me/{config.bot_username}?start=owner_{code}",
        }
    ), 201


@bp.delete("/api/settings/telegram")
@login_required
def unlink_telegram():
    services().store.users.update_one(
        {"company_id": g.company_id}, {"$unset": {"owner_telegram_id": "", "owner_linked_at": "", "owner_link": ""}}
    )
    return jsonify({"message": "Telegram владельца отвязан"}), 200
