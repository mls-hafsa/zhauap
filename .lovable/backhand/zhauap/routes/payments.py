"""Чеки об оплате: список, фото, подтверждение/отклонение."""

import logging
import os
import re

from flask import Blueprint, Response, g, jsonify, request, send_file
from pymongo import ReturnDocument

from ..integrations.telegram import TelegramError
from ..security import error, json_body, login_required, parse_object_id, services
from ..services.catalog import parse_stock
from ..utils import normalize_text, serialize_doc, utcnow

log = logging.getLogger(__name__)
bp = Blueprint("payments", __name__)

SAFE_FILENAME_RE = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webp|pdf)$")
PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}


def serialize_payment(doc):
    out = serialize_doc(doc, drop=("file_id", "local_file"))
    items = doc.get("items") or []
    # Старые записи могли хранить один товар в item_name/quantity.
    if not items and doc.get("item_name"):
        items = [{"name": doc["item_name"], "quantity": doc.get("quantity") or 1}]
    out["items"] = items
    out["mime_type"] = doc.get("mime_type") or "image/jpeg"
    out["key"] = f"tg:{doc['telegram_id']}" if doc.get("telegram_id") is not None else None
    return out


@bp.get("/api/payments/pending")
@login_required
def list_payments():
    status = request.args.get("status", "pending")
    query = {"company_id": g.company_id}
    if status in ("pending", "approved", "rejected"):
        query["status"] = status
    docs = services().store.payments.find(query).sort("created_at", -1).limit(200)
    return jsonify([serialize_payment(d) for d in docs]), 200


@bp.get("/api/payments/<payment_id>/photo")
@login_required
def payment_photo(payment_id):
    svc = services()
    oid = parse_object_id(payment_id)
    if not oid:
        return error("Неверный id!")
    payment = svc.store.payments.find_one({"_id": oid, "company_id": g.company_id})
    if not payment:
        return error("Чек не найден!", 404)
    mime = payment.get("mime_type") or "image/jpeg"

    local = payment.get("local_file")
    if local and SAFE_FILENAME_RE.match(local):
        path = os.path.join(svc.config.receipts_dir, local)
        if os.path.exists(path):
            response = send_file(os.path.abspath(path), mimetype=mime)
            response.headers.update(PRIVATE_HEADERS)
            return response

    if not payment.get("file_id"):
        return error("Файл чека не найден!", 404)
    if not svc.telegram:
        return error("TELEGRAM_TOKEN не настроен на сервере!", 500)
    try:
        content = svc.telegram.download_file(svc.telegram.get_file_path(payment["file_id"]))
    except TelegramError as exc:
        log.warning("Не удалось получить чек из Telegram: %s", exc)
        return error("Не удалось получить файл чека из Telegram", 502)
    return Response(content, mimetype=mime, headers=PRIVATE_HEADERS)


def _decrement_stock(store, company_id, item_name, quantity):
    """Списывает остаток. Возвращает предупреждение или None."""
    key = normalize_text(item_name)
    service = None
    for doc in store.services.find({"company_id": company_id}):
        if normalize_text(doc.get("name")) == key:
            service = doc
            break
    if not service:
        return f"Не удалось найти «{item_name}» в каталоге для списания."
    for _ in range(3):
        current_raw = service.get("stock")
        current = parse_stock(current_raw)
        if current is None:
            return None  # остаток не ведётся — списывать нечего
        new_value = max(0, current - quantity)
        # Условие на старое значение защищает от двух одновременных списаний.
        result = store.services.update_one(
            {"_id": service["_id"], "stock": current_raw}, {"$set": {"stock": str(new_value), "updated_at": utcnow()}}
        )
        if result.modified_count == 1 or current == new_value:
            if current < quantity:
                return f"Остаток «{service['name']}» был {current}, а продано {quantity}. Остаток выставлен в 0."
            return None
        service = store.services.find_one({"_id": service["_id"]}) or service
    return f"Не удалось списать остаток «{item_name}» — попробуйте поправить его в каталоге вручную."


@bp.post("/api/payments/<payment_id>/verify")
@login_required
def verify_payment(payment_id):
    svc = services()
    oid = parse_object_id(payment_id)
    if not oid:
        return error("Неверный id!")
    status = json_body().get("status")
    if status not in ("approved", "rejected"):
        return error("Неверный статус")

    # Атомарный переход pending -> approved/rejected: повторное нажатие ничего не спишет.
    payment = svc.store.payments.find_one_and_update(
        {"_id": oid, "company_id": g.company_id, "status": "pending"},
        {"$set": {"status": status, "verified_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    if payment is None:
        existing = svc.store.payments.find_one({"_id": oid, "company_id": g.company_id})
        if not existing:
            return error("Чек не найден!", 404)
        return error("Этот чек уже обработан.", 409, payment_status=existing.get("status"))

    warnings = []
    if status == "approved":
        for item in payment.get("items") or []:
            name = item.get("name")
            if not name:
                continue
            try:
                quantity = max(1, int(item.get("quantity") or 1))
            except (TypeError, ValueError):
                quantity = 1
            warning = _decrement_stock(svc.store, g.company_id, name, quantity)
            if warning:
                warnings.append(warning)
        if payment.get("telegram_id") is not None:
            svc.store.user_sessions.update_one(
                {"telegram_id": payment["telegram_id"]}, {"$unset": {f"carts.{g.company_id}": ""}}
            )

    telegram_id = payment.get("telegram_id")
    if telegram_id is not None:
        text = (
            "✅ Ваша оплата подтверждена! Заказ принят в работу."
            if status == "approved"
            else "❌ Оплата не подтверждена. Пожалуйста, свяжитесь с менеджером в этом чате."
        )
        delivered = svc.assistant._send(telegram_id, text)  # noqa: SLF001
        svc.store.leads.insert_one(
            {
                "company_id": g.company_id,
                "telegram_id": telegram_id,
                "client_id": f"tg:{telegram_id}",
                "channel": "telegram",
                "contact": payment.get("contact") or str(telegram_id),
                "name": payment.get("name") or "",
                "notes": None,
                "message": None,
                "ai_response": text,
                "answer_source": "system",
                "status": "bot",
                "answered": True,
                "delivery_failed": not delivered,
                "created_at": utcnow(),
            }
        )

    response = {"message": f"Статус платежа обновлён: {status}"}
    if warnings:
        response["warning"] = " ".join(warnings)
    return jsonify(response), 200
