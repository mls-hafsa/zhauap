"""Каталог товаров/услуг и база знаний: валидация, импорт CSV, форматирование.

Правила:
- одна позиция на компанию на одно нормализованное название (без дублей);
- остаток не выдумывается: пустой остаток = «наличие уточнить»;
- импорт возвращает отчёт: создано / обновлено / пропущено с причиной.
"""

import csv
import io
import re

from ..utils import clip, normalize_text, utcnow

MAX_CSV_BYTES = 2 * 1024 * 1024
MAX_CSV_ROWS = 5000
MAX_REPORTED_ERRORS = 50

NAME_LIMIT = 200
PRICE_LIMIT = 50
KB_QUESTION_LIMIT = 500
KB_ANSWER_LIMIT = 4000

SERVICE_HEADERS = {
    "name": {"name", "название", "наименование", "товар", "услуга", "title", "product"},
    "price": {"price", "цена", "стоимость", "cost", "баға", "бағасы"},
    "stock": {"stock", "остаток", "количество", "кол-во", "qty", "quantity", "наличие", "қалдық"},
}
KB_HEADERS = {
    "question": {"question", "вопрос", "сұрақ", "q"},
    "answer": {"answer", "ответ", "жауап", "a"},
}

CURRENCY_RE = re.compile(r"(₸|тг|тенге|теңге|kzt|tg|\$|руб|₽|usd|eur|€)", re.IGNORECASE)


class ValidationError(ValueError):
    pass


class CsvImportError(ValueError):
    def __init__(self, message, report=None):
        super().__init__(message)
        self.report = report or {}


# ----------------------------- валидация -----------------------------


def clean_name(value):
    name = clip(value, NAME_LIMIT + 1)
    if not name:
        raise ValidationError("Укажите название")
    if len(name) > NAME_LIMIT:
        raise ValidationError(f"Название длиннее {NAME_LIMIT} символов")
    return name


def clean_price(value):
    price = clip(value, PRICE_LIMIT + 1)
    if not price:
        raise ValidationError("Укажите цену")
    if len(price) > PRICE_LIMIT:
        raise ValidationError(f"Цена длиннее {PRICE_LIMIT} символов")
    if not re.search(r"\d", price):
        raise ValidationError("В цене должна быть хотя бы одна цифра")
    return price


def clean_stock(value):
    """Пустая строка = остаток не указан. Иначе целое число ≥ 0."""
    raw = clip(value, 20)
    if raw == "":
        return ""
    digits = raw.replace(" ", "").replace(" ", "")
    if not re.fullmatch(r"\d+", digits):
        raise ValidationError("Остаток должен быть целым числом ≥ 0 или пустым")
    return str(int(digits))


def parse_stock(value):
    """Число из поля stock или None, если остаток не указан/не число (старые записи)."""
    if value is None:
        return None
    raw = str(value).strip().replace(" ", "")
    if re.fullmatch(r"\d+", raw):
        return int(raw)
    return None


def price_amount(price):
    """Числовое значение цены: '18 000 ₸' -> 18000, '1 500,50' -> 1500.5. None, если не число."""
    if price is None:
        return None
    text = CURRENCY_RE.sub("", str(price)).replace(" ", " ").strip()
    match = re.search(r"\d[\d\s]*(?:[.,]\d{1,2})?", text)
    if not match:
        return None
    number = match.group(0).replace(" ", "").replace(",", ".")
    try:
        value = float(number)
    except ValueError:
        return None
    return int(value) if value.is_integer() else value


def format_price(price):
    """Цена для промпта: не дописываем «тг», если валюта уже указана."""
    text = str(price or "").strip()
    if not text:
        return "цена не указана"
    if CURRENCY_RE.search(text):
        return text
    return f"{text} ₸"


# ----------------------------- CSV -----------------------------


def decode_csv(raw):
    if len(raw) > MAX_CSV_BYTES:
        raise CsvImportError(f"Файл больше {MAX_CSV_BYTES // (1024 * 1024)} МБ")
    if not raw.strip():
        raise CsvImportError("Файл пустой")
    for encoding in ("utf-8-sig", "cp1251"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise CsvImportError("Не удалось прочитать кодировку файла. Сохраните CSV в UTF-8.")


def detect_delimiter(text):
    first_line = text.splitlines()[0] if text.splitlines() else ""
    counts = {d: first_line.count(d) for d in (";", ",", "\t")}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ","


def _map_headers(fieldnames, header_aliases):
    mapping = {}
    for raw in fieldnames or []:
        key = normalize_text(raw)
        for target, aliases in header_aliases.items():
            if key in aliases and target not in mapping:
                mapping[target] = raw
    return mapping


def read_csv_rows(raw, header_aliases, required):
    text = decode_csv(raw)
    delimiter = detect_delimiter(text)
    reader = csv.DictReader(io.StringIO(text, newline=""), delimiter=delimiter)
    mapping = _map_headers(reader.fieldnames, header_aliases)
    missing = [field for field in required if field not in mapping]
    if missing:
        expected = ", ".join(f"{f} ({'/'.join(sorted(header_aliases[f]))})" for f in missing)
        raise CsvImportError(
            f"Не найдены обязательные столбцы: {expected}. "
            f"Разделитель определён как «{'TAB' if delimiter == chr(9) else delimiter}»."
        )
    rows = []
    for index, row in enumerate(reader, start=2):  # строка 1 — заголовок
        if index - 1 > MAX_CSV_ROWS:
            raise CsvImportError(f"В файле больше {MAX_CSV_ROWS} строк — разделите его на части")
        values = {target: (row.get(source) or "") for target, source in mapping.items()}
        if not any(str(v).strip() for v in values.values()):
            continue
        rows.append((index, values))
    return rows, delimiter


def _report(delimiter):
    return {"created": 0, "updated": 0, "skipped": 0, "errors": [], "delimiter": delimiter}


def _add_error(report, row, reason):
    report["skipped"] += 1
    if len(report["errors"]) < MAX_REPORTED_ERRORS:
        report["errors"].append({"row": row, "reason": reason})


def import_services_csv(store, company_id, raw):
    rows, delimiter = read_csv_rows(raw, SERVICE_HEADERS, required=("name", "price"))
    report = _report(delimiter)
    existing = {}
    for doc in store.services.find({"company_id": company_id}, {"name": 1}):
        existing.setdefault(normalize_text(doc.get("name")), doc["_id"])

    seen_in_file = set()
    now = utcnow()
    for row_number, values in rows:
        try:
            name = clean_name(values.get("name"))
            price = clean_price(values.get("price"))
            stock = clean_stock(values.get("stock")) if "stock" in values else None
        except ValidationError as exc:
            _add_error(report, row_number, str(exc))
            continue
        key = normalize_text(name)
        if key in seen_in_file:
            _add_error(report, row_number, f"«{name}» уже встречался выше в этом файле")
            continue
        seen_in_file.add(key)

        fields = {"name": name, "name_norm": key, "price": price, "updated_at": now}
        if stock is not None and (stock != "" or key not in existing):
            fields["stock"] = stock
        if key in existing:
            store.services.update_one({"_id": existing[key], "company_id": company_id}, {"$set": fields})
            report["updated"] += 1
        else:
            fields.setdefault("stock", "")
            fields.update({"company_id": company_id, "created_at": now})
            result = store.services.insert_one(fields)
            existing[key] = result.inserted_id
            report["created"] += 1

    if report["created"] + report["updated"] == 0:
        raise CsvImportError("Ни одна строка не импортирована", report)
    return report


def import_knowledge_csv(store, company_id, raw):
    rows, delimiter = read_csv_rows(raw, KB_HEADERS, required=("question", "answer"))
    report = _report(delimiter)
    existing = {}
    for doc in store.knowledge_base.find({"company_id": company_id}, {"question": 1}):
        existing.setdefault(normalize_text(doc.get("question")), doc["_id"])

    seen_in_file = set()
    now = utcnow()
    for row_number, values in rows:
        try:
            question, answer = clean_kb_pair(values.get("question"), values.get("answer"))
        except ValidationError as exc:
            _add_error(report, row_number, str(exc))
            continue
        key = normalize_text(question)
        if key in seen_in_file:
            _add_error(report, row_number, "Такой вопрос уже встречался выше в этом файле")
            continue
        seen_in_file.add(key)
        fields = {"question": question, "question_norm": key, "answer": answer, "updated_at": now}
        if key in existing:
            store.knowledge_base.update_one({"_id": existing[key], "company_id": company_id}, {"$set": fields})
            report["updated"] += 1
        else:
            fields.update({"company_id": company_id, "created_at": now})
            result = store.knowledge_base.insert_one(fields)
            existing[key] = result.inserted_id
            report["created"] += 1

    if report["created"] + report["updated"] == 0:
        raise CsvImportError("Ни одна строка не импортирована", report)
    return report


def clean_kb_pair(question, answer):
    question = clip(question, KB_QUESTION_LIMIT + 1)
    answer = clip(answer, KB_ANSWER_LIMIT + 1)
    if not question or not answer:
        raise ValidationError("Заполните вопрос и ответ")
    if len(question) > KB_QUESTION_LIMIT:
        raise ValidationError(f"Вопрос длиннее {KB_QUESTION_LIMIT} символов")
    if len(answer) > KB_ANSWER_LIMIT:
        raise ValidationError(f"Ответ длиннее {KB_ANSWER_LIMIT} символов")
    return question, answer


def find_service_by_name(store, company_id, name, exclude_id=None):
    key = normalize_text(name)
    for doc in store.services.find({"company_id": company_id}, {"name": 1}):
        if normalize_text(doc.get("name")) == key and doc["_id"] != exclude_id:
            return doc
    return None
