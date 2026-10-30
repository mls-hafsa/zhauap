"""Диалоги с клиентами: список, сообщения, режим бот/владелец, ответ владельца.

Ключ диалога в URL:
- tg:<telegram_id> — стабильный ключ (не меняется при смене ника клиента);
- c:<contact> или просто <contact> — для старых записей и старого frontend.
"""

import logging
import re
from datetime import datetime

from flask import Blueprint, g, jsonify, request

from ..integrations.telegram import TelegramError
from ..security import error, json_body, login_required, parse_object_id, services
from ..utils import as_utc, clip, client_key, iso, serialize_doc, utcnow

log = logging.getLogger(__name__)
bp = Blueprint("conversations", __name__)

OWNER_MESSAGE_LIMIT = 4000
LEADS_DEFAULT_LIMIT = 500
LEADS_MAX_LIMIT = 2000
MESSAGES_DEFAULT_LIMIT = 50
MESSAGES_MAX_LIMIT = 200
LIST_MAX_LIMIT = 500
NOT_DELETED = {"deleted": {"$ne": True}}


def _int_arg(name, default, minimum, maximum):
    try:
        value = int(request.args.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def resolve_client(company_id, key):
    """Возвращает (filter, telegram_id, contact) для ключа диалога этой компании."""
    store = services().store
    key = key or ""
    if key.startswith("tg:") and re.fullmatch(r"-?\d+", key[3:]):
        telegram_id = int(key[3:])
        last = store.leads.find_one(
            {"company_id": company_id, "telegram_id": telegram_id}, sort=[("created_at", -1)]
        )
        if last is None and not store.conversations.find_one({"company_id": company_id, "telegram_id": telegram_id}):
            # Этот человек никогда не писал этой компании: не даём писать ему через бота.
            return {"telegram_id": telegram_id}, None, None
        return {"telegram_id": telegram_id}, telegram_id, (last or {}).get("contact")
    contact = key[2:] if key.startswith("c:") else key
    last = store.leads.find_one(
        {"company_id": company_id, "contact": contact, "telegram_id": {"$exists": True}},
        sort=[("created_at", -1)],
    )
    if last and last.get("telegram_id") is not None:
        return {"telegram_id": last["telegram_id"]}, last["telegram_id"], contact
    return {"contact": contact}, None, contact


def conversation_state(conv):
    svc = services()
    mode = svc.conversations.effective_mode(conv)
    awaiting = bool(conv and conv.get("awaiting_since"))
    resume_at = as_utc((conv or {}).get("resume_at"))
    minutes_left = None
    if conv and conv.get("mode") == "manual" and resume_at:
        seconds = max(0, (resume_at - utcnow()).total_seconds())
        minutes_left = int((seconds + 59) // 60)
    return {
        # «expired» для клиента — всё ещё ручной режим, пока фоновая задача не вернула AI.
        "mode": "manual" if mode in ("manual", "expired") else "bot",
        "awaiting_owner": bool(conv and conv.get("mode") == "manual" and awaiting),
        "manual_reason": (conv or {}).get("manual_reason"),
        "handoff_reason": (conv or {}).get("handoff_reason"),
        "resume_at": iso(resume_at),
        "minutes_left": minutes_left,
        "awaiting_since": iso((conv or {}).get("awaiting_since")),
        "version": int((conv or {}).get("version") or 0),
        "archived": bool((conv or {}).get("archived")),
    }


def list_status(conv, pending_payments):
    if conv and conv.get("mode") == "manual" and conv.get("awaiting_since"):
        return "need"
    if conv and conv.get("mode") == "manual":
        return "owner"
    if pending_payments:
        return "wait"
    return "bot"


def display_contact(username, telegram_id, contact):
    if username:
        return f"@{username}"
    if telegram_id is not None:
        return f"ID {telegram_id}"
    return contact or "—"


def serialize_message(doc):
    out = serialize_doc(doc, drop=("password",))
    out["key"] = client_key(doc.get("telegram_id"), doc.get("contact"))
    out["channel"] = doc.get("channel") or "telegram"
    return out


# ---------------------------------------------------------------- список


def build_conversation_list(company_id, q=""):
    store = services().store
    match = {"company_id": company_id, **NOT_DELETED}
    if q:
        pattern = {"$regex": re.escape(q[:100]), "$options": "i"}
        match["$or"] = [{"name": pattern}, {"contact": pattern}, {"username": pattern}, {"notes": pattern}]
    pipeline = [
        {"$match": match},
        {"$sort": {"created_at": -1, "_id": -1}},
        {
            "$group": {
                "_id": {"$ifNull": ["$telegram_id", "$contact"]},
                "last": {"$first": "$$ROOT"},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"last.created_at": -1}},
    ]
    groups = list(store.leads.aggregate(pipeline))

    telegram_ids = [g_["last"].get("telegram_id") for g_ in groups if g_["last"].get("telegram_id") is not None]
    convs_by_tid = {
        c["telegram_id"]: c
        for c in store.conversations.find({"company_id": company_id, "telegram_id": {"$in": telegram_ids}})
    }
    legacy_convs = {
        c.get("contact"): c
        for c in store.conversations.find({"company_id": company_id, "telegram_id": {"$exists": False}})
    }
    pending_by_tid = {}
    for payment in store.payments.find({"company_id": company_id, "status": "pending"}, {"telegram_id": 1}):
        pending_by_tid[payment.get("telegram_id")] = pending_by_tid.get(payment.get("telegram_id"), 0) + 1

    items = []
    for group in groups:
        last = group["last"]
        telegram_id = last.get("telegram_id")
        conv = convs_by_tid.get(telegram_id) if telegram_id is not None else legacy_convs.get(last.get("contact"))
        pending = pending_by_tid.get(telegram_id, 0) if telegram_id is not None else 0
        state = conversation_state(conv)
        preview = last.get("notes") or last.get("message") or last.get("ai_response") or ""
        items.append(
            {
                "key": client_key(telegram_id, last.get("contact")),
                "telegram_id": telegram_id,
                "contact": last.get("contact"),
                "username": last.get("username") or "",
                "display_contact": display_contact(last.get("username"), telegram_id, last.get("contact")),
                "name": last.get("name") or "",
                "channel": last.get("channel") or "telegram",
                "last_message": clip(preview, 200),
                "last_source": last.get("answer_source"),
                "last_at": iso(last.get("created_at")),
                "message_count": group["count"],
                "pending_payments": pending,
                "status": list_status(conv, pending),
                **state,
            }
        )
    return items


@bp.get("/api/conversations")
@login_required
def list_conversations():
    svc = services()
    svc.assistant.maybe_tick()
    q = (request.args.get("q") or "").strip()
    status = (request.args.get("status") or "all").strip()
    include_archived = request.args.get("include_archived") == "1"
    limit = _int_arg("limit", 50, 1, LIST_MAX_LIMIT)
    offset = _int_arg("offset", 0, 0, 1_000_000)

    items = [i for i in build_conversation_list(g.company_id, q) if include_archived or not i["archived"]]
    counts = {"all": len(items), "bot": 0, "need": 0, "owner": 0, "wait": 0}
    for item in items:
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    if status in ("bot", "need", "owner", "wait"):
        items = [i for i in items if i["status"] == status]
    page = items[offset : offset + limit]
    return jsonify(
        {"items": page, "total": len(items), "counts": counts, "limit": limit, "offset": offset,
         "has_more": offset + limit < len(items)}
    ), 200


@bp.get("/api/conversations/<key>/messages")
@login_required
def conversation_messages(key):
    store = services().store
    flt, telegram_id, contact = resolve_client(g.company_id, key)
    query = {"company_id": g.company_id, **flt, **NOT_DELETED}
    before = as_utc((request.args.get("before") or "").replace(" ", "+") or None)
    if before:
        query["created_at"] = {"$lt": before}
    limit = _int_arg("limit", MESSAGES_DEFAULT_LIMIT, 1, MESSAGES_MAX_LIMIT)
    docs = list(store.leads.find(query).sort([("created_at", -1), ("_id", -1)]).limit(limit + 1))
    has_more = len(docs) > limit
    docs = list(reversed(docs[:limit]))
    return jsonify({"items": [serialize_message(d) for d in docs], "has_more": has_more}), 200


@bp.get("/api/conversations/<key>")
@login_required
def get_conversation(key):
    svc = services()
    svc.assistant.maybe_tick()
    flt, telegram_id, contact = resolve_client(g.company_id, key)
    conv = svc.conversations.get(g.company_id, telegram_id, contact)
    last = svc.store.leads.find_one({"company_id": g.company_id, **flt, **NOT_DELETED}, sort=[("created_at", -1)])
    pending = (
        svc.store.payments.count_documents({"company_id": g.company_id, "telegram_id": telegram_id, "status": "pending"})
        if telegram_id is not None
        else 0
    )
    state = conversation_state(conv)
    return jsonify(
        {
            "key": client_key(telegram_id, contact),
            "contact": contact,
            "telegram_id": telegram_id,
            "name": (last or {}).get("name") or (conv or {}).get("name") or "",
            "username": (last or {}).get("username") or "",
            "display_contact": display_contact((last or {}).get("username"), telegram_id, contact),
            "channel": (last or {}).get("channel") or "telegram",
            "first_at": iso(
                (svc.store.leads.find_one({"company_id": g.company_id, **flt}, sort=[("created_at", 1)]) or {}).get(
                    "created_at"
                )
            ),
            "status": list_status(conv, pending),
            "pending_payments": pending,
            "can_reply": telegram_id is not None and svc.telegram is not None,
            **state,
        }
    ), 200


@bp.patch("/api/conversations/<key>")
@login_required
def set_conversation_mode(key):
    svc = services()
    mode = clip(json_body().get("mode"), 10)
    if mode not in ("bot", "manual"):
        return error("Недопустимый режим! Используйте 'bot' или 'manual'.")
    flt, telegram_id, contact = resolve_client(g.company_id, key)
    if telegram_id is None:
        return error("Диалог не найден или в нём нет Telegram-клиента", 404)
    conv = svc.conversations.ensure(g.company_id, telegram_id, contact)
    if mode == "manual":
        conv = svc.conversations.take_over(conv, "owner_takeover")
    else:
        conv = svc.assistant.hand_back(conv)
    return jsonify({"message": "Режим обновлён!", "key": client_key(telegram_id, contact), **conversation_state(conv)}), 200


@bp.post("/api/conversations/<key>/send")
@login_required
def send_owner_reply(key):
    svc = services()
    text = clip(json_body().get("message"), OWNER_MESSAGE_LIMIT + 1)
    if not text:
        return error("Сообщение не может быть пустым!")
    if len(text) > OWNER_MESSAGE_LIMIT:
        return error(f"Сообщение длиннее {OWNER_MESSAGE_LIMIT} символов")
    if not svc.telegram:
        return error("TELEGRAM_TOKEN не настроен на сервере!", 500)
    flt, telegram_id, contact = resolve_client(g.company_id, key)
    if telegram_id is None:
        return error("Не удалось найти Telegram этого клиента!", 404)

    last = svc.store.leads.find_one({"company_id": g.company_id, "telegram_id": telegram_id}, sort=[("created_at", -1)])
    conv = svc.conversations.ensure(g.company_id, telegram_id, contact)
    # Сначала фиксируем ответ владельца в состоянии: любой ответ AI, который сейчас
    # готовится, увидит новую версию и не будет отправлен.
    conv = svc.conversations.register_owner_reply(conv)
    try:
        svc.telegram.send_message(telegram_id, text)
    except TelegramError as exc:
        return error(f"Telegram не доставил сообщение: {exc.description}", 502)

    svc.store.leads.insert_one(
        {
            "company_id": g.company_id,
            "telegram_id": telegram_id,
            "client_id": f"tg:{telegram_id}",
            "channel": "telegram",
            "username": (last or {}).get("username", ""),
            "name": (last or {}).get("name", ""),
            "contact": contact or str(telegram_id),
            "notes": None,
            "message": None,
            "ai_response": text,
            "answer_source": "owner",
            "status": "owner",
            "answered": True,
            "created_at": utcnow(),
        }
    )
    svc.store.leads.update_many(
        {"company_id": g.company_id, "telegram_id": telegram_id, "answered": False}, {"$set": {"answered": True}}
    )
    return jsonify({"message": "Отправлено!", **conversation_state(conv)}), 200


@bp.delete("/api/conversations/<key>")
@login_required
def archive_conversation(key):
    return _archive(key)


def _archive(key):
    svc = services()
    flt, telegram_id, contact = resolve_client(g.company_id, key)
    if telegram_id is None:
        # Старые диалоги без telegram_id архивируем через документ по contact.
        svc.store.conversations.update_one(
            {"company_id": g.company_id, "contact": contact},
            {"$set": {"archived": True, "archived_at": utcnow()}, "$setOnInsert": {"mode": "bot", "version": 0}},
            upsert=True,
        )
    else:
        conv = svc.conversations.ensure(g.company_id, telegram_id, contact)
        svc.conversations.archive(conv)
    return jsonify({"message": "Диалог перенесён в архив. История сохранена."}), 200


# ---------------------------------------------------------------- совместимость: /api/leads


@bp.get("/api/leads")
@login_required
def get_leads():
    store = services().store
    limit = _int_arg("limit", LEADS_DEFAULT_LIMIT, 1, LEADS_MAX_LIMIT)
    query = {"company_id": g.company_id, **NOT_DELETED}
    before = as_utc((request.args.get("before") or "").replace(" ", "+") or None)
    if before:
        query["created_at"] = {"$lt": before}
    docs = store.leads.find(query).sort("created_at", -1).limit(limit)
    return jsonify([serialize_message(d) for d in docs]), 200


@bp.delete("/api/leads/<lead_id>")
@login_required
def delete_lead(lead_id):
    oid = parse_object_id(lead_id)
    if not oid:
        return error("Неверный id!")
    result = services().store.leads.update_one(
        {"_id": oid, "company_id": g.company_id}, {"$set": {"deleted": True, "deleted_at": utcnow()}}
    )
    if result.matched_count == 0:
        return error("Сообщение не найдено!", 404)
    return jsonify({"message": "Сообщение скрыто"}), 200


@bp.delete("/api/leads/by-contact/<contact>")
@login_required
def delete_conversation_legacy(contact):
    return _archive(contact)


# ---------------------------------------------------------------- уведомления и статистика


@bp.get("/api/notifications")
@login_required
def notifications():
    svc = services()
    svc.assistant.maybe_tick()
    waiting = [i for i in build_conversation_list(g.company_id) if i["status"] == "need" and not i["archived"]]
    pending_payments = svc.store.payments.count_documents({"company_id": g.company_id, "status": "pending"})
    items = [
        {
            "type": "need_owner",
            "key": i["key"],
            "name": i["name"] or i["display_contact"],
            "text": i["handoff_reason"] or i["last_message"],
            "at": i["awaiting_since"] or i["last_at"],
            "minutes_left": i["minutes_left"],
        }
        for i in waiting
    ]
    return jsonify(
        {
            "items": items,
            "need_owner": len(items),
            "pending_payments": pending_payments,
            "total": len(items) + pending_payments,
            "owner_telegram_linked": bool(g.user.get("owner_telegram_id")),
        }
    ), 200


@bp.get("/api/stats")
@login_required
def stats():
    store = services().store
    base = {"company_id": g.company_id, **NOT_DELETED}
    clients = list(
        store.leads.aggregate(
            [{"$match": base}, {"$group": {"_id": {"$ifNull": ["$telegram_id", "$contact"]}}}]
        )
    )
    total_clients = len(clients)
    today = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return jsonify(
        {
            "total_leads": store.leads.count_documents(base),
            "total_bot_replies": store.leads.count_documents({**base, "answer_source": {"$in": ["ai", "knowledge_base"]}}),
            "owner_replies": store.leads.count_documents({**base, "answer_source": "owner"}),
            "handoffs": store.leads.count_documents({**base, "handoff": True}),
            "messages_today": store.leads.count_documents({**base, "created_at": {"$gte": today}}),
            "active_leads": total_clients,
            "total_users": total_clients,
            "waiting_owner": store.conversations.count_documents(
                {"company_id": g.company_id, "mode": "manual", "awaiting_since": {"$exists": True}}
            ),
            "pending_payments": store.payments.count_documents({"company_id": g.company_id, "status": "pending"}),
            "generated_at": iso(datetime.now().astimezone()),
        }
    ), 200
