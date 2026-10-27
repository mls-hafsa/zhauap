import os
import csv
import io
import re
import uuid
from functools import wraps
from datetime import datetime, timezone, timedelta

import bcrypt
import requests
from bson.objectid import ObjectId
from dotenv import load_dotenv
from flask import Flask, request, jsonify, session, Response, send_file
from flask_cors import CORS
from pymongo import MongoClient

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "zhauap_super_secret_key_2026")

app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = False

CORS(
    app,
    supports_credentials=True,
    origins=re.compile(r"^http://(localhost|127\.0\.0\.1):\d+$"),
)

MONGO_URI = os.getenv("MONGO_URI")
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
BOT_USERNAME = os.getenv("BOT_USERNAME", "zhauapai_bot")
TRIAL_DAYS = 14
MANUAL_TIMEOUT_MINUTES = 10
RECEIPTS_DIR = "receipts"

try:
    client = MongoClient(MONGO_URI)
    db = client["zhauap_database"]
    users_collection = db["users"]
    leads_collection = db["leads"]
    knowledge_base_collection = db["knowledge_base"]
    services_collection = db["services"]
    conversations_collection = db["conversations"]
    payments_collection = db["payments"]
    print("✅ Успешное подключение к MongoDB!")
except Exception as e:
    print(f"❌ Ошибка подключения к БД: {e}")


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "company_id" not in session:
            return jsonify({"error": "Unauthorized. Пожалуйста, авторизуйтесь."}), 401
        return f(*args, **kwargs)
    return decorated_function


def serialize_doc(doc):
    doc["_id"] = str(doc["_id"])
    for key in ["created_at", "manual_since", "trial_started_at"]:
        if key in doc and hasattr(doc[key], "isoformat"):
            value = doc[key]
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            doc[key] = value.isoformat()
    return doc


def trial_info(user):
    started = user.get("trial_started_at")
    if not started:
        return {"trial_days_left": TRIAL_DAYS, "trial_active": True}
    if isinstance(started, str):
        try:
            started = datetime.fromisoformat(started.replace("Z", "+00:00"))
        except Exception:
            started = datetime.now(timezone.utc)
    if getattr(started, "tzinfo", None) is None:
        started = started.replace(tzinfo=timezone.utc)
    end = started + timedelta(days=TRIAL_DAYS)
    left = max(0, (end - datetime.now(timezone.utc)).days)
    return {"trial_days_left": left, "trial_active": left > 0}


def parse_csv_rows(file_storage):
    """Общая функция чтения CSV с автоопределением кодировки — используется и для каталога, и для базы знаний."""
    raw = file_storage.stream.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1251")
    stream = io.StringIO(text, newline=None)
    return list(csv.DictReader(stream))


# -------------------- AUTH --------------------

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "api": "zhauap"}), 200


@app.route("/api/register", methods=["POST"])
def register():
    data = request.json or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    business_name = data.get("business_name", "Мой бизнес").strip()

    if not email or not password:
        return jsonify({"error": "Заполните все поля!"}), 400
    if users_collection.find_one({"email": email}):
        return jsonify({"error": "Такой email уже зарегистрирован!"}), 400

    hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    company_id = "comp_" + uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc)

    users_collection.insert_one({
        "email": email,
        "password": hashed_password,
        "business_name": business_name,
        "company_id": company_id,
        "trial_started_at": now,
        "created_at": now,
    })

    session["company_id"] = company_id
    telegram_link = f"https://t.me/{BOT_USERNAME}?start={company_id}"

    return jsonify({
        "message": "Регистрация успешна!",
        "email": email,
        "company_id": company_id,
        "business_name": business_name,
        "telegram_link": telegram_link,
        "trial_days_left": TRIAL_DAYS,
        "trial_active": True,
    }), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.json or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Введите email и пароль!"}), 400

    user = users_collection.find_one({"email": email})
    if not user or not bcrypt.checkpw(password.encode("utf-8"), user["password"]):
        return jsonify({"error": "Неверный email или пароль!"}), 401

    company_id = user.get("company_id", "")
    if not company_id:
        company_id = "comp_" + uuid.uuid4().hex[:8]
        users_collection.update_one(
            {"_id": user["_id"]},
            {"$set": {"company_id": company_id, "trial_started_at": datetime.now(timezone.utc)}},
        )

    if not user.get("trial_started_at"):
        users_collection.update_one(
            {"_id": user["_id"]},
            {"$set": {"trial_started_at": datetime.now(timezone.utc)}},
        )
        user["trial_started_at"] = datetime.now(timezone.utc)

    session["company_id"] = company_id
    telegram_link = f"https://t.me/{BOT_USERNAME}?start={company_id}"
    info = trial_info(user)

    return jsonify({
        "message": "Вход выполнен успешно!",
        "email": email,
        "company_id": company_id,
        "business_name": user.get("business_name", "Мой бизнес"),
        "telegram_link": telegram_link,
        **info,
    }), 200


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Вы вышли из аккаунта"}), 200


@app.route("/api/me", methods=["GET"])
@login_required
def get_me():
    company_id = session["company_id"]
    user = users_collection.find_one({"company_id": company_id})
    if not user:
        return jsonify({"error": "Компания не найдена!"}), 404
    info = trial_info(user)
    return jsonify({
        "company_id": company_id,
        "business_name": user.get("business_name", ""),
        "email": user.get("email", ""),
        **info,
    }), 200


# -------------------- LEADS --------------------

@app.route("/api/leads", methods=["GET"])
@login_required
def get_leads():
    company_id = session["company_id"]
    leads = list(leads_collection.find({"company_id": company_id}).sort("created_at", -1))
    return jsonify([serialize_doc(l) for l in leads]), 200


@app.route("/api/leads/<lead_id>", methods=["DELETE"])
@login_required
def delete_lead(lead_id):
    company_id = session["company_id"]
    try:
        result = leads_collection.delete_one({"_id": ObjectId(lead_id), "company_id": company_id})
    except Exception:
        return jsonify({"error": "Неверный id!"}), 400
    if result.deleted_count == 0:
        return jsonify({"error": "Лид не найден!"}), 404
    return jsonify({"message": "Удалено!"}), 200


@app.route("/api/leads/by-contact/<contact>", methods=["DELETE"])
@login_required
def delete_conversation(contact):
    company_id = session["company_id"]
    result = leads_collection.delete_many({"company_id": company_id, "contact": contact})
    conversations_collection.delete_one({"company_id": company_id, "contact": contact})
    return jsonify({"message": f"Удалено сообщений: {result.deleted_count}"}), 200


# -------------------- SERVICES / CSV --------------------

@app.route("/api/services", methods=["GET"])
@login_required
def get_services():
    company_id = session["company_id"]
    services = list(services_collection.find({"company_id": company_id}))
    return jsonify([serialize_doc(s) for s in services]), 200


@app.route("/api/services", methods=["POST"])
@login_required
def add_service():
    company_id = session["company_id"]
    data = request.json or {}
    name = data.get("name", "").strip()
    price = data.get("price", "").strip()
    stock = data.get("stock", "").strip()
    if not name or not price:
        return jsonify({"error": "Укажите название и цену товара!"}), 400
    result = services_collection.insert_one({
        "company_id": company_id,
        "name": name,
        "price": price,
        "stock": stock,
    })
    return jsonify({"message": "Товар добавлен!", "id": str(result.inserted_id)}), 201


@app.route("/api/services/<service_id>", methods=["PATCH"])
@login_required
def update_service(service_id):
    company_id = session["company_id"]
    data = request.json or {}
    update_fields = {}
    for field in ["name", "price", "stock"]:
        if field in data:
            update_fields[field] = str(data[field]).strip()
    if not update_fields:
        return jsonify({"error": "Нечего обновлять!"}), 400
    try:
        result = services_collection.update_one(
            {"_id": ObjectId(service_id), "company_id": company_id},
            {"$set": update_fields},
        )
    except Exception:
        return jsonify({"error": "Неверный id!"}), 400
    if result.matched_count == 0:
        return jsonify({"error": "Товар не найден!"}), 404
    return jsonify({"message": "Обновлено!"}), 200


@app.route("/api/services/<service_id>", methods=["DELETE"])
@login_required
def delete_service(service_id):
    company_id = session["company_id"]
    try:
        result = services_collection.delete_one(
            {"_id": ObjectId(service_id), "company_id": company_id}
        )
    except Exception:
        return jsonify({"error": "Неверный id!"}), 400
    if result.deleted_count == 0:
        return jsonify({"error": "Товар не найден!"}), 404
    return jsonify({"message": "Товар удалён!"}), 200


@app.route("/api/products/upload-csv", methods=["POST"])
@login_required
def upload_csv():
    if "file" not in request.files:
        return jsonify({"error": "Файл не загружен"}), 400
    company_id = session["company_id"]
    try:
        rows = parse_csv_rows(request.files["file"])
        items_to_insert = []
        for row in rows:
            name = (row.get("name") or row.get("Название") or "").strip()
            price = (row.get("price") or row.get("Цена") or "").strip()
            stock = (row.get("stock") or row.get("Остаток") or "10").strip()
            if name and price:
                items_to_insert.append({
                    "company_id": company_id,
                    "name": name,
                    "price": price,
                    "stock": stock,
                })
        if items_to_insert:
            services_collection.insert_many(items_to_insert)
        return jsonify({"message": f"Успешно импортировано {len(items_to_insert)} товаров!"}), 200
    except Exception as e:
        return jsonify({"error": f"Ошибка обработки файла CSV: {e}"}), 400


# -------------------- KNOWLEDGE BASE --------------------

@app.route("/api/knowledge-base", methods=["GET"])
@login_required
def get_knowledge_base():
    company_id = session["company_id"]
    items = list(knowledge_base_collection.find({"company_id": company_id}))
    return jsonify([serialize_doc(item) for item in items]), 200


@app.route("/api/knowledge-base", methods=["POST"])
@login_required
def add_knowledge_base_item():
    company_id = session["company_id"]
    data = request.json or {}
    question = data.get("question", "").strip()
    answer = data.get("answer", "").strip()
    if not question or not answer:
        return jsonify({"error": "Заполните вопрос и ответ!"}), 400
    result = knowledge_base_collection.insert_one({
        "company_id": company_id,
        "question": question,
        "answer": answer,
    })
    return jsonify({"message": "Запись добавлена!", "id": str(result.inserted_id)}), 201


@app.route("/api/knowledge-base/<item_id>", methods=["DELETE"])
@login_required
def delete_knowledge_base_item(item_id):
    company_id = session["company_id"]
    try:
        result = knowledge_base_collection.delete_one(
            {"_id": ObjectId(item_id), "company_id": company_id}
        )
    except Exception:
        return jsonify({"error": "Неверный id!"}), 400
    if result.deleted_count == 0:
        return jsonify({"error": "Запись не найдена!"}), 404
    return jsonify({"message": "Запись удалена!"}), 200


@app.route("/api/knowledge-base/upload-csv", methods=["POST"])
@login_required
def upload_knowledge_base_csv():
    """CSV должен содержать столбцы question/Вопрос и answer/Ответ."""
    if "file" not in request.files:
        return jsonify({"error": "Файл не загружен"}), 400
    company_id = session["company_id"]
    try:
        rows = parse_csv_rows(request.files["file"])
        items_to_insert = []
        for row in rows:
            question = (row.get("question") or row.get("Вопрос") or "").strip()
            answer = (row.get("answer") or row.get("Ответ") or "").strip()
            if question and answer:
                items_to_insert.append({
                    "company_id": company_id,
                    "question": question,
                    "answer": answer,
                })
        if items_to_insert:
            knowledge_base_collection.insert_many(items_to_insert)
        return jsonify({"message": f"Успешно импортировано {len(items_to_insert)} записей!"}), 200
    except Exception as e:
        return jsonify({"error": f"Ошибка обработки файла CSV: {e}"}), 400


# -------------------- PAYMENT SETTINGS --------------------

@app.route("/api/settings/payment", methods=["GET"])
@login_required
def get_pay_settings():
    company_id = session["company_id"]
    user = users_collection.find_one({"company_id": company_id})
    if not user:
        return jsonify({"error": "Компания не найдена!"}), 404
    return jsonify({
        "payment_info": user.get("payment_info", ""),
        "payment_qr": user.get("payment_qr", ""),
    }), 200


@app.route("/api/settings/payment", methods=["PATCH"])
@login_required
def update_pay_settings():
    company_id = session["company_id"]
    data = request.json or {}
    update_fields = {}
    if "payment_info" in data:
        update_fields["payment_info"] = str(data["payment_info"]).strip()
    if "payment_qr" in data:
        update_fields["payment_qr"] = data["payment_qr"]
    if not update_fields:
        return jsonify({"error": "Нечего обновлять!"}), 400
    result = users_collection.update_one({"company_id": company_id}, {"$set": update_fields})
    if result.matched_count == 0:
        return jsonify({"error": "Компания не найдена!"}), 404
    return jsonify({"message": "Реквизиты сохранены!"}), 200


# -------------------- CONVERSATIONS --------------------

@app.route("/api/conversations/<contact>", methods=["GET"])
@login_required
def get_conversation_mode(contact):
    company_id = session["company_id"]
    conv = conversations_collection.find_one({"company_id": company_id, "contact": contact})
    mode = conv["mode"] if conv else "bot"
    minutes_left = None
    if conv and mode == "manual" and conv.get("manual_since"):
        ms = conv["manual_since"]
        if hasattr(ms, "tzinfo") and ms.tzinfo is None:
            ms = ms.replace(tzinfo=timezone.utc)
        if hasattr(ms, "isoformat"):
            elapsed = datetime.now(timezone.utc) - ms
            minutes_left = max(0, MANUAL_TIMEOUT_MINUTES - int(elapsed.total_seconds() // 60))
            if minutes_left == 0:
                conversations_collection.update_one(
                    {"_id": conv["_id"]},
                    {"$set": {"mode": "bot"}, "$unset": {"manual_since": ""}},
                )
                mode = "bot"
                minutes_left = None
    return jsonify({
        "contact": contact,
        "mode": mode,
        "minutes_left": minutes_left,
    }), 200


@app.route("/api/conversations/<contact>", methods=["PATCH"])
@login_required
def set_conversation_mode(contact):
    company_id = session["company_id"]
    data = request.json or {}
    mode = (data.get("mode") or "").strip()
    if mode not in ["bot", "manual"]:
        return jsonify({"error": "Недопустимый режим! Используйте 'bot' или 'manual'."}), 400

    if mode == "manual":
        conversations_collection.update_one(
            {"company_id": company_id, "contact": contact},
            {"$set": {"mode": "manual", "manual_since": datetime.now(timezone.utc)}},
            upsert=True,
        )
    else:
        conversations_collection.update_one(
            {"company_id": company_id, "contact": contact},
            {"$set": {"mode": "bot"}, "$unset": {"manual_since": ""}},
            upsert=True,
        )
    return jsonify({"message": "Режим обновлён!", "contact": contact, "mode": mode}), 200


@app.route("/api/conversations/<contact>/send", methods=["POST"])
@login_required
def send_manual_reply(contact):
    company_id = session["company_id"]
    data = request.json or {}
    text = (data.get("message") or "").strip()

    if not text:
        return jsonify({"error": "Сообщение не может быть пустым!"}), 400
    if not TELEGRAM_TOKEN:
        return jsonify({"error": "TELEGRAM_TOKEN не настроен на сервере!"}), 500

    last_lead = leads_collection.find_one(
        {"company_id": company_id, "contact": contact},
        sort=[("created_at", -1)],
    )
    if not last_lead or "telegram_id" not in last_lead:
        return jsonify({"error": "Не удалось найти Telegram этого клиента!"}), 404

    telegram_id = last_lead["telegram_id"]
    try:
        tg_response = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": telegram_id, "text": text},
            timeout=10,
        )
        tg_data = tg_response.json()
        if not tg_data.get("ok"):
            return jsonify({"error": f"Telegram отклонил сообщение: {tg_data.get('description')}"}), 502
    except Exception as e:
        return jsonify({"error": f"Не удалось отправить в Telegram: {e}"}), 500

    leads_collection.insert_one({
        "company_id": company_id,
        "telegram_id": telegram_id,
        "username": last_lead.get("username", ""),
        "name": last_lead.get("name", ""),
        "contact": contact,
        "notes": None,
        "message": None,
        "ai_response": text,
        "answer_source": "owner",
        "status": "owner",
        "created_at": datetime.now(timezone.utc),
    })
    return jsonify({"message": "Отправлено!"}), 200


# -------------------- PAYMENTS --------------------

@app.route("/api/payments/pending", methods=["GET"])
@login_required
def get_pending_payments():
    company_id = session["company_id"]
    payments = list(payments_collection.find({"company_id": company_id, "status": "pending"}))
    return jsonify([serialize_doc(p) for p in payments]), 200


@app.route("/api/payments/<payment_id>/photo", methods=["GET"])
@login_required
def get_payment_photo(payment_id):
    company_id = session["company_id"]
    try:
        payment = payments_collection.find_one({"_id": ObjectId(payment_id), "company_id": company_id})
    except Exception:
        return jsonify({"error": "Неверный id!"}), 400
    if not payment:
        return jsonify({"error": "Чек не найден!"}), 404

    local_filename = payment.get("local_file")
    if local_filename:
        local_path = os.path.join(RECEIPTS_DIR, local_filename)
        if os.path.exists(local_path):
            return send_file(local_path, mimetype="image/jpeg")

    if not payment.get("file_id"):
        return jsonify({"error": "Чек не найден!"}), 404
    if not TELEGRAM_TOKEN:
        return jsonify({"error": "TELEGRAM_TOKEN не настроен на сервере!"}), 500

    try:
        file_info = requests.get(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getFile",
            params={"file_id": payment["file_id"]},
            timeout=10,
        ).json()
        if not file_info.get("ok"):
            return jsonify({"error": "Не удалось получить файл из Telegram"}), 502
        file_path = file_info["result"]["file_path"]
        file_url = f"https://api.telegram.org/file/bot{TELEGRAM_TOKEN}/{file_path}"
        file_response = requests.get(file_url, timeout=15)
        return Response(file_response.content, mimetype="image/jpeg")
    except Exception as e:
        return jsonify({"error": f"Ошибка получения фото: {e}"}), 500


@app.route("/api/payments/<payment_id>/verify", methods=["POST"])
@login_required
def verify_payment(payment_id):
    company_id = session["company_id"]
    data = request.json or {}
    status = data.get("status")
    if status not in ["approved", "rejected"]:
        return jsonify({"error": "Неверный статус"}), 400
    try:
        payment = payments_collection.find_one({"_id": ObjectId(payment_id), "company_id": company_id})
    except Exception:
        return jsonify({"error": "Неверный id!"}), 400
    if not payment:
        return jsonify({"error": "Чек не найден!"}), 404

    payments_collection.update_one({"_id": ObjectId(payment_id)}, {"$set": {"status": status}})

    warnings = []
    if status == "approved":
        items = payment.get("items") or []
        for it in items:
            item_name = it.get("name")
            try:
                quantity_bought = int(it.get("quantity") or 1)
            except (TypeError, ValueError):
                quantity_bought = 1

            if not item_name:
                continue

            service = services_collection.find_one({
                "company_id": company_id,
                "name": item_name,
            })
            if service:
                try:
                    current_stock = int(service.get("stock") or 0)
                except (TypeError, ValueError):
                    current_stock = 0

                new_stock = max(0, current_stock - quantity_bought)
                services_collection.update_one(
                    {"_id": service["_id"]},
                    {"$set": {"stock": str(new_stock)}},
                )
                if current_stock < quantity_bought:
                    warnings.append(
                        f"Остаток «{item_name}» был {current_stock}, а продано {quantity_bought}. Остаток выставлен в 0."
                    )
            else:
                warnings.append(f"Не удалось найти товар «{item_name}» в каталоге для списания.")

    if TELEGRAM_TOKEN and payment.get("telegram_id"):
        text = (
            "✅ Ваша оплата подтверждена! Заказ принят в работу."
            if status == "approved"
            else "❌ Оплата не подтверждена. Пожалуйста, свяжитесь с менеджером."
        )
        try:
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                json={"chat_id": payment["telegram_id"], "text": text},
                timeout=5,
            )
        except Exception as e:
            print(f"⚠️ Ошибка отправки уведомления в TG: {e}")

    response = {"message": f"Статус платежа обновлён: {status}"}
    if warnings:
        response["warning"] = " ".join(warnings)
    return jsonify(response), 200


# -------------------- STATS --------------------

@app.route("/api/stats", methods=["GET"])
@login_required
def get_stats():
    company_id = session["company_id"]
    company_filter = {"company_id": company_id}
    total_leads = leads_collection.count_documents(company_filter)
    total_bot_replies = leads_collection.count_documents({
        **company_filter,
        "answer_source": {"$in": ["ai", "knowledge_base"]},
    })
    active_leads = len(leads_collection.distinct("contact", company_filter))
    return jsonify({
        "total_leads": total_leads,
        "total_bot_replies": total_bot_replies,
        "active_leads": active_leads,
        "total_users": 0,
        "total_returns": 0,
        "pending_returns": 0,
    }), 200



if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)