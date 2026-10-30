"""Каталог товаров/услуг и база знаний (CRUD + импорт CSV)."""

from flask import Blueprint, g, jsonify, request

from ..security import error, json_body, login_required, parse_object_id, services
from ..services import catalog as cat
from ..utils import normalize_text, serialize_doc, utcnow

bp = Blueprint("catalog", __name__)


def _uploaded_bytes():
    file = request.files.get("file")
    if file is None or not file.filename:
        return None, error("Файл не загружен")
    raw = file.stream.read(cat.MAX_CSV_BYTES + 1)
    if len(raw) > cat.MAX_CSV_BYTES:
        return None, error(f"Файл больше {cat.MAX_CSV_BYTES // (1024 * 1024)} МБ", 413)
    return raw, None


def _import_message(report, noun):
    parts = [f"Импорт завершён: добавлено {report['created']}, обновлено {report['updated']}"]
    if report["skipped"]:
        parts.append(f", пропущено {report['skipped']}")
    return "".join(parts) + f" {noun}."


# ---------------------------------------------------------------- каталог


@bp.get("/api/services")
@login_required
def list_services():
    docs = services().store.services.find({"company_id": g.company_id}).sort("name", 1)
    return jsonify([serialize_doc(d) for d in docs]), 200


@bp.post("/api/services")
@login_required
def add_service():
    store = services().store
    data = json_body()
    try:
        name = cat.clean_name(data.get("name"))
        price = cat.clean_price(data.get("price"))
        stock = cat.clean_stock(data.get("stock"))
    except cat.ValidationError as exc:
        return error(str(exc))
    if cat.find_service_by_name(store, g.company_id, name):
        return error(f"Позиция «{name}» уже есть в каталоге — измените её в таблице.", 409)
    now = utcnow()
    result = store.services.insert_one(
        {
            "company_id": g.company_id,
            "name": name,
            "name_norm": normalize_text(name),
            "price": price,
            "stock": stock,
            "created_at": now,
            "updated_at": now,
        }
    )
    return jsonify({"message": "Товар добавлен!", "id": str(result.inserted_id)}), 201


@bp.patch("/api/services/<service_id>")
@login_required
def update_service(service_id):
    store = services().store
    oid = parse_object_id(service_id)
    if not oid:
        return error("Неверный id!")
    data = json_body()
    fields = {}
    try:
        if "name" in data:
            fields["name"] = cat.clean_name(data["name"])
            fields["name_norm"] = normalize_text(fields["name"])
        if "price" in data:
            fields["price"] = cat.clean_price(data["price"])
        if "stock" in data:
            fields["stock"] = cat.clean_stock(data["stock"])
    except cat.ValidationError as exc:
        return error(str(exc))
    if not fields:
        return error("Нечего обновлять!")
    if "name" in fields and cat.find_service_by_name(store, g.company_id, fields["name"], exclude_id=oid):
        return error(f"Позиция «{fields['name']}» уже есть в каталоге.", 409)
    fields["updated_at"] = utcnow()
    result = store.services.update_one({"_id": oid, "company_id": g.company_id}, {"$set": fields})
    if result.matched_count == 0:
        return error("Товар не найден!", 404)
    return jsonify({"message": "Обновлено!"}), 200


@bp.delete("/api/services/<service_id>")
@login_required
def delete_service(service_id):
    oid = parse_object_id(service_id)
    if not oid:
        return error("Неверный id!")
    result = services().store.services.delete_one({"_id": oid, "company_id": g.company_id})
    if result.deleted_count == 0:
        return error("Товар не найден!", 404)
    return jsonify({"message": "Товар удалён!"}), 200


@bp.post("/api/products/upload-csv")
@login_required
def upload_services_csv():
    raw, err = _uploaded_bytes()
    if err:
        return err
    try:
        report = cat.import_services_csv(services().store, g.company_id, raw)
    except cat.CsvImportError as exc:
        return error(str(exc), 400, report=exc.report)
    return jsonify({"message": _import_message(report, "позиций"), "report": report}), 200


# ---------------------------------------------------------------- база знаний


@bp.get("/api/knowledge-base")
@login_required
def list_knowledge():
    docs = services().store.knowledge_base.find({"company_id": g.company_id}).sort("question", 1)
    return jsonify([serialize_doc(d) for d in docs]), 200


def _find_question(store, question, exclude_id=None):
    key = normalize_text(question)
    for doc in store.knowledge_base.find({"company_id": g.company_id}, {"question": 1}):
        if normalize_text(doc.get("question")) == key and doc["_id"] != exclude_id:
            return doc
    return None


@bp.post("/api/knowledge-base")
@login_required
def add_knowledge():
    store = services().store
    data = json_body()
    try:
        question, answer = cat.clean_kb_pair(data.get("question"), data.get("answer"))
    except cat.ValidationError as exc:
        return error(str(exc))
    if _find_question(store, question):
        return error("Такой вопрос уже есть в базе знаний — отредактируйте его.", 409)
    now = utcnow()
    result = store.knowledge_base.insert_one(
        {
            "company_id": g.company_id,
            "question": question,
            "question_norm": normalize_text(question),
            "answer": answer,
            "created_at": now,
            "updated_at": now,
        }
    )
    return jsonify({"message": "Запись добавлена!", "id": str(result.inserted_id)}), 201


@bp.patch("/api/knowledge-base/<item_id>")
@login_required
def update_knowledge(item_id):
    store = services().store
    oid = parse_object_id(item_id)
    if not oid:
        return error("Неверный id!")
    current = store.knowledge_base.find_one({"_id": oid, "company_id": g.company_id})
    if not current:
        return error("Запись не найдена!", 404)
    data = json_body()
    try:
        question, answer = cat.clean_kb_pair(
            data.get("question", current.get("question")), data.get("answer", current.get("answer"))
        )
    except cat.ValidationError as exc:
        return error(str(exc))
    if _find_question(store, question, exclude_id=oid):
        return error("Такой вопрос уже есть в базе знаний.", 409)
    store.knowledge_base.update_one(
        {"_id": oid, "company_id": g.company_id},
        {"$set": {"question": question, "question_norm": normalize_text(question), "answer": answer, "updated_at": utcnow()}},
    )
    return jsonify({"message": "Запись обновлена!"}), 200


@bp.delete("/api/knowledge-base/<item_id>")
@login_required
def delete_knowledge(item_id):
    oid = parse_object_id(item_id)
    if not oid:
        return error("Неверный id!")
    result = services().store.knowledge_base.delete_one({"_id": oid, "company_id": g.company_id})
    if result.deleted_count == 0:
        return error("Запись не найдена!", 404)
    return jsonify({"message": "Запись удалена!"}), 200


@bp.post("/api/knowledge-base/upload-csv")
@login_required
def upload_knowledge_csv():
    raw, err = _uploaded_bytes()
    if err:
        return err
    try:
        report = cat.import_knowledge_csv(services().store, g.company_id, raw)
    except cat.CsvImportError as exc:
        return error(str(exc), 400, report=exc.report)
    return jsonify({"message": _import_message(report, "записей"), "report": report}), 200
