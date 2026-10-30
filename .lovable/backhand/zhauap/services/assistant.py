"""Обработка входящих сообщений Telegram и автоматическое возвращение AI.

Один общий бот обслуживает все компании. Клиент привязывается к компании по
ссылке t.me/<bot>?start=<company_id>; владелец — одноразовым кодом из настроек.
"""

import base64
import binascii
import logging
import os
import re
import threading
import time
import uuid
from dataclasses import dataclass

from pymongo.errors import DuplicateKeyError

from ..integrations.telegram import TelegramError
from ..utils import as_utc, clip, is_valid_company_id, utcnow
from .accounts import consume_owner_link_code
from .ai import CLIENT_HOLD_REPLY, HISTORY_LIMIT, AIResult, generate_reply, kb_exact_answer, wants_human

log = logging.getLogger(__name__)

MESSAGE_LIMIT = 4000
RECEIPT_MAX_BYTES = 10 * 1024 * 1024
RECEIPT_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}

TEXT_NEED_LINK = "Пожалуйста, откройте персональную ссылку компании, чтобы начать диалог."
TEXT_BAD_LINK = "Ссылка недействительна. Попросите у компании актуальную ссылку на чат."
TEXT_UNSUPPORTED = "Я пока понимаю только текстовые сообщения и фото или PDF чеков об оплате. Напишите, пожалуйста, текстом."
TEXT_TEMP_ERROR = "Извините, сейчас временная проблема с обработкой сообщения. Попробуйте написать ещё раз через пару минут."
# Служебные формулировки, которые могут быть только во внутренних уведомлениях владельцу.
# Если такой текст вдруг оказался в сообщении клиенту (например, модель скопировала причину),
# клиент получает нейтральное CLIENT_HOLD_REPLY.
INTERNAL_MARKERS_RE = re.compile(
    r"(AI назвал цену|Вопрос клиента требует проверки|needs_human|handoff|Причина:|"
    r"Нужен ваш ответ|нужен\s+(ваш\s+)?ответ\s+владельц|Уведомление для владельца)",
    re.IGNORECASE,
)
OWNER_NOTICE_HEADER = "🔒 Уведомление для владельца (клиент его не видит)"

TEXT_CLIENT_HANDOFF = (
    "Хорошо, передаю ваш вопрос владельцу — он ответит здесь. "
    "Если он не сможет ответить в течение {minutes} минут, я продолжу помогать."
)


@dataclass
class ClientContext:
    telegram_id: int
    chat_id: int
    username: str
    name: str
    message_id: int = None
    update_id: int = None

    @property
    def contact(self):
        return self.username or str(self.telegram_id)


def parse_data_url(data_url):
    """'data:image/png;base64,...' -> (bytes, mime). Бросает ValueError при мусоре."""
    match = re.match(r"^data:(image/(?:png|jpeg|webp));base64,(.+)$", data_url or "", re.DOTALL)
    if not match:
        raise ValueError("unsupported data url")
    try:
        return base64.b64decode(match.group(2), validate=True), match.group(1)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("bad base64") from exc


class Assistant:
    def __init__(self, store, telegram, gemini, conversations, config, clock=utcnow):
        self.store = store
        self.telegram = telegram
        self.gemini = gemini
        self.conversations = conversations
        self.config = config
        self.clock = clock
        self.last_update_at = None
        self._tick_lock = threading.Lock()
        self._last_tick = 0.0

    # =================== вход: апдейт Telegram ===================

    def process_update(self, update):
        """Обрабатывает один апдейт. Повторная доставка того же update_id игнорируется."""
        if not isinstance(update, dict):
            return "ignored"
        self.last_update_at = self.clock()
        update_id = update.get("update_id")
        if isinstance(update_id, int):
            try:
                self.store.processed_updates.insert_one({"update_id": update_id, "created_at": self.clock()})
            except DuplicateKeyError:
                log.info("Повторная доставка update_id=%s — пропускаю", update_id)
                return "duplicate"
        message = update.get("message")
        if not isinstance(message, dict):
            return "ignored"
        try:
            self.handle_message(message, update_id)
        except Exception:  # noqa: BLE001 — один плохой апдейт не должен ронять webhook
            log.exception("Ошибка обработки update_id=%s", update_id)
            chat_id = (message.get("chat") or {}).get("id")
            if chat_id and self.telegram:
                self._send(chat_id, TEXT_TEMP_ERROR)
            return "error"
        return "ok"

    def handle_message(self, message, update_id=None):
        chat = message.get("chat") or {}
        sender = message.get("from") or {}
        if chat.get("type") not in (None, "private") or sender.get("is_bot"):
            return  # группы и другие боты не обслуживаются
        if not sender.get("id") or not chat.get("id"):
            return
        ctx = ClientContext(
            telegram_id=int(sender["id"]),
            chat_id=int(chat["id"]),
            username=clip(sender.get("username"), 64),
            name=clip(sender.get("first_name") or sender.get("username") or "Клиент", 100),
            message_id=message.get("message_id"),
            update_id=update_id,
        )
        text = message.get("text")
        if isinstance(text, str) and text.startswith("/"):
            command, _, arg = text.partition(" ")
            command = command.split("@")[0].lower()
            if command == "/start":
                return self.handle_start(ctx, arg.strip())
            if command == "/owner":
                return self.handle_owner(ctx, arg.strip())
        if message.get("photo") or message.get("document"):
            return self.handle_receipt(ctx, message)
        if isinstance(text, str) and text.strip():
            return self.handle_text(ctx, text)
        self._send(ctx.chat_id, TEXT_UNSUPPORTED)

    # =================== команды ===================

    def handle_start(self, ctx, arg):
        if arg.lower().startswith("owner_"):
            return self.handle_owner(ctx, arg[len("owner_"):])
        if arg:
            user = self.store.users.find_one({"company_id": arg}) if is_valid_company_id(arg) else None
            if not user:
                return self._send(ctx.chat_id, TEXT_BAD_LINK)
            self.store.user_sessions.update_one(
                {"telegram_id": ctx.telegram_id},
                {"$set": {"company_id": arg, "updated_at": self.clock()}},
                upsert=True,
            )
            name = user.get("business_name") or "компания"
            return self._send(ctx.chat_id, f"Здравствуйте! Вы на связи с «{name}». Чем могу помочь?")
        user = self._client_company(ctx)
        if user:
            name = user.get("business_name") or "компания"
            return self._send(ctx.chat_id, f"Рады снова вас видеть! Вы на связи с «{name}». Какой у вас вопрос?")
        return self._send(ctx.chat_id, TEXT_NEED_LINK)

    def handle_owner(self, ctx, arg):
        if not arg:
            return self._send(
                ctx.chat_id,
                "Чтобы получать уведомления, откройте на сайте Zhauap «Настройки → Telegram владельца», "
                "получите одноразовый код и отправьте сюда: /owner КОД",
            )
        if arg.lower().startswith("comp_"):
            return self._send(
                ctx.chat_id,
                "Привязка по ID компании отключена для безопасности. Получите одноразовый код на сайте: "
                "«Настройки → Telegram владельца».",
            )
        user = consume_owner_link_code(self.store, arg, ctx.telegram_id)
        if not user:
            return self._send(ctx.chat_id, "Код неверный или устарел. Получите новый код в настройках на сайте.")
        name = user.get("business_name") or "ваш бизнес"
        return self._send(
            ctx.chat_id,
            f"✅ Telegram привязан к «{name}». Сюда будут приходить уведомления о вопросах клиентов и новых чеках.",
        )

    # =================== текст клиента ===================

    def handle_text(self, ctx, text):
        user = self._client_company(ctx)
        if not user:
            return self._send(ctx.chat_id, TEXT_NEED_LINK)
        company_id = user["company_id"]
        text = clip(text, MESSAGE_LIMIT)
        conv = self.conversations.ensure(company_id, ctx.telegram_id, ctx.contact, ctx.name)

        if self.conversations.effective_mode(conv) == "expired":
            # Владелец не ответил за отведённое время — диалог возвращается боту.
            # Неотвеченные сообщения клиента попадут в историю и AI ответит на всё сразу.
            claimed = self.conversations.claim_resume(conv)
            if claimed:
                self.conversations.clear_awaiting(claimed["_id"], self.conversations.version(claimed))
            conv = self.conversations.get(company_id, ctx.telegram_id) or conv

        if self.conversations.effective_mode(conv) == "manual":
            self._save(user, ctx, notes=text, ai_response=None, answer_source="manual", status="need", answered=False)
            conv, first_waiting = self.conversations.register_waiting_client(conv)
            if first_waiting:
                self._notify_owner(
                    user,
                    f"💬 Клиент {self._label(ctx)} ждёт вашего ответа:\n«{clip(text, 300)}»\n\n"
                    f"Ответьте на сайте в разделе «Входящие». Если не ответите за "
                    f"{self.config.manual_timeout_minutes} мин, ответит AI.",
                    client_id=ctx.telegram_id,
                )
            return

        version = self.conversations.version(conv)

        if wants_human(text):
            reply = TEXT_CLIENT_HANDOFF.format(minutes=self.config.manual_timeout_minutes)
            self._send(ctx.chat_id, reply, ctx.message_id)
            self._save(
                user, ctx, notes=text, ai_response=reply, answer_source="system", status="need",
                answered=False, handoff=True, handoff_reason="Клиент попросил связаться с человеком",
            )
            self.conversations.take_over(
                conv, "client_request", handoff_reason="Клиент попросил связаться с человеком", awaiting=True
            )
            self._notify_handoff(user, ctx, text, "Клиент попросил связаться с человеком")
            return

        kb_items = list(self.store.knowledge_base.find({"company_id": company_id}))
        exact = kb_exact_answer(kb_items, text)
        if exact:
            result = AIResult(reply=exact, source="knowledge_base")
        else:
            catalog = list(self.store.services.find({"company_id": company_id}))
            history = self._history(company_id, ctx.telegram_id)
            result = generate_reply(self.gemini, user, catalog, kb_items, history, text)

        if not self.conversations.is_current(conv["_id"], version):
            # Пока AI думал, владелец перехватил диалог — устаревший ответ не отправляем.
            self._save(user, ctx, notes=text, ai_response=None, answer_source="manual", status="need", answered=False)
            fresh = self.conversations.get(company_id, ctx.telegram_id)
            if fresh and fresh.get("mode") == "manual":
                self.conversations.register_waiting_client(fresh)
            return

        if result.needs_human:
            # Клиенту — только нейтральный текст. Причина и черновик AI — во «Входящих» и уведомлении владельцу.
            client_text = self._client_safe(result.reply)
            self._send(ctx.chat_id, client_text, ctx.message_id)
            self._save(
                user, ctx, notes=text, ai_response=client_text, answer_source=result.source, status="need",
                answered=False, handoff=True, handoff_reason=result.handoff_reason, ai_draft=result.draft or None,
            )
            self.conversations.take_over(conv, "ai_handoff", handoff_reason=result.handoff_reason, awaiting=True)
            self._notify_handoff(user, ctx, text, result.handoff_reason, draft=result.draft)
            return

        result.reply = self._client_safe(result.reply)
        sent = self._send(ctx.chat_id, result.reply, ctx.message_id)
        self._save(
            user, ctx, notes=text, ai_response=result.reply, answer_source=result.source, status="bot",
            answered=True, delivery_failed=not sent,
        )
        self._mark_answered(company_id, ctx.telegram_id)
        if result.items:
            self._save_cart(ctx.telegram_id, company_id, result.items)
        if result.wants_payment:
            self.send_payment_info(user, ctx.chat_id)

    # =================== чеки ===================

    def handle_receipt(self, ctx, message):
        user = self._client_company(ctx)
        if not user:
            return self._send(ctx.chat_id, TEXT_NEED_LINK)
        company_id = user["company_id"]

        if message.get("photo"):
            photo = message["photo"][-1]
            file_id, mime_type, size = photo.get("file_id"), "image/jpeg", photo.get("file_size") or 0
        else:
            document = message["document"]
            file_id = document.get("file_id")
            mime_type = (document.get("mime_type") or "").lower()
            size = document.get("file_size") or 0
            if mime_type not in RECEIPT_MIME_TYPES:
                return self._send(ctx.chat_id, "Пришлите, пожалуйста, чек как фото или PDF-файл.")
        if not file_id:
            return self._send(ctx.chat_id, TEXT_TEMP_ERROR)
        if size and size > RECEIPT_MAX_BYTES:
            return self._send(ctx.chat_id, "Файл слишком большой. Пришлите скриншот чека.")

        local_file = self._download_receipt(file_id, mime_type)
        session = self.store.user_sessions.find_one({"telegram_id": ctx.telegram_id}) or {}
        items = ((session.get("carts") or {}).get(company_id)) or []
        self.conversations.ensure(company_id, ctx.telegram_id, ctx.contact, ctx.name)

        self.store.payments.insert_one(
            {
                "company_id": company_id,
                "telegram_id": ctx.telegram_id,
                "contact": ctx.contact,
                "name": ctx.name,
                "file_id": file_id,
                "local_file": local_file,
                "mime_type": mime_type,
                "items": items,
                "status": "pending",
                "update_id": ctx.update_id,
                "created_at": self.clock(),
            }
        )
        reply = "✅ Спасибо! Чек принят на проверку. Менеджер подтвердит оплату в ближайшее время."
        self._save(
            user, ctx, notes="[Отправлен чек об оплате]", ai_response=reply, answer_source="system",
            status="wait", answered=True,
        )
        self._send(ctx.chat_id, reply, ctx.message_id)
        items_text = ", ".join(f"{it['name']} ×{it['quantity']}" for it in items) or "товары не определены"
        self._notify_owner(
            user,
            f"🧾 Новый чек на проверку\nКлиент: {self._label(ctx)}\nПокупка: {items_text}\n\n"
            "Подтвердите или отклоните его на сайте в разделе «Оплаты».",
            client_id=ctx.telegram_id,
        )

    def _download_receipt(self, file_id, mime_type):
        if not self.telegram:
            return None
        try:
            file_path = self.telegram.get_file_path(file_id)
            content = self.telegram.download_file(file_path)
            if len(content) > RECEIPT_MAX_BYTES:
                return None
            extension = {"image/png": "png", "image/webp": "webp", "application/pdf": "pdf"}.get(mime_type, "jpg")
            os.makedirs(self.config.receipts_dir, exist_ok=True)
            filename = f"{uuid.uuid4().hex}.{extension}"
            with open(os.path.join(self.config.receipts_dir, filename), "wb") as fh:
                fh.write(content)
            return filename
        except (TelegramError, OSError) as exc:
            # Не страшно: фото потом подтянется из Telegram по file_id.
            log.warning("Не удалось заранее скачать чек: %s", exc)
            return None

    def send_payment_info(self, user, chat_id):
        info = (user.get("payment_info") or "").strip()
        caption = (info or "Реквизиты для оплаты") + "\n\n📩 После оплаты отправьте скриншот или PDF чека в этот чат."
        qr = user.get("payment_qr") or ""
        if qr and self.telegram:
            try:
                photo, mime = parse_data_url(qr)
                self.telegram.send_photo(chat_id, photo, caption=caption, mime_type=mime)
                return True
            except (ValueError, TelegramError) as exc:
                log.warning("Не удалось отправить QR: %s", exc)
        if info:
            return self._send(chat_id, caption)
        self._notify_owner(
            user, "⚠️ Клиент готов оплатить, но реквизиты не заполнены. Заполните их в «Настройках».", client_id=chat_id
        )
        return self._send(chat_id, "Реквизиты для оплаты ещё не настроены. Владелец свяжется с вами, чтобы завершить заказ.")

    # =================== возвращение AI по таймеру ===================

    def run_due_resumes(self, limit=50):
        handled = 0
        for conv in self.conversations.due(limit):
            try:
                if self.resume(conv):
                    handled += 1
            except Exception:  # noqa: BLE001
                log.exception("Не удалось вернуть диалог %s боту", conv.get("_id"))
        return handled

    def maybe_tick(self, min_interval=20):
        """Дешёвый вызов из запросов: не чаще раза в min_interval секунд на процесс."""
        now = time.monotonic()
        if now - self._last_tick < min_interval or not self._tick_lock.acquire(blocking=False):
            return 0
        try:
            self._last_tick = now
            return self.run_due_resumes()
        except Exception:  # noqa: BLE001 — попутный тик не должен ломать запрос, ради которого вызван
            log.exception("Попутная проверка просроченных диалогов не удалась")
            return 0
        finally:
            self._tick_lock.release()

    def hand_back(self, conv):
        """Владелец нажал «Вернуть боту». Если клиент ждёт ответа — AI отвечает сразу."""
        if not conv or conv.get("mode") != "manual":
            return conv
        self.store.conversations.update_one(
            {"_id": conv["_id"], "mode": "manual"}, {"$set": {"resume_at": self.clock()}}
        )
        fresh = self.store.conversations.find_one({"_id": conv["_id"]})
        if fresh and fresh.get("mode") == "manual":
            self.resume(fresh)
        return self.store.conversations.find_one({"_id": conv["_id"]})

    def resume(self, conv):
        claimed = self.conversations.claim_resume(conv)
        if not claimed:
            return False
        version = self.conversations.version(claimed)
        telegram_id = claimed.get("telegram_id")
        company_id = claimed["company_id"]
        if not claimed.get("awaiting_since") or telegram_id is None:
            self.conversations.clear_awaiting(claimed["_id"], version)
            return True

        user = self.store.users.find_one({"company_id": company_id})
        pending = list(
            self.store.leads.find(
                {"company_id": company_id, "telegram_id": telegram_id, "answered": False, "deleted": {"$ne": True}}
            )
        )
        if not user or not pending:
            self.conversations.clear_awaiting(claimed["_id"], version)
            return True

        kb_items = list(self.store.knowledge_base.find({"company_id": company_id}))
        catalog = list(self.store.services.find({"company_id": company_id}))
        history = self._history(company_id, telegram_id)
        result = generate_reply(self.gemini, user, catalog, kb_items, history, "", resume=True)

        if not self.conversations.is_current(claimed["_id"], version):
            return True  # владелец успел ответить — наш ответ уже не нужен

        last = pending[-1]
        ctx = ClientContext(
            telegram_id=telegram_id,
            chat_id=telegram_id,
            username=last.get("username") or "",
            name=last.get("name") or "Клиент",
        )
        result.reply = self._client_safe(result.reply)
        sent = self._send(ctx.chat_id, result.reply)
        self._save(
            user, ctx, notes=None, ai_response=result.reply, answer_source="ai", status="bot",
            answered=True, kind="auto_resume", delivery_failed=not sent,
        )
        self._mark_answered(company_id, telegram_id)
        self.conversations.clear_awaiting(claimed["_id"], version)
        if result.items:
            self._save_cart(telegram_id, company_id, result.items)
        if result.wants_payment:
            self.send_payment_info(user, ctx.chat_id)
        self._notify_owner(
            user,
            f"🤖 Вы не ответили клиенту {self._label(ctx)} за {self.config.manual_timeout_minutes} мин — "
            "AI продолжил диалог. Историю видно на сайте во «Входящих».",
            client_id=telegram_id,
        )
        return True

    # =================== помощники ===================

    def _client_company(self, ctx):
        session = self.store.user_sessions.find_one({"telegram_id": ctx.telegram_id})
        company_id = (session or {}).get("company_id")
        if not company_id:
            return None
        return self.store.users.find_one({"company_id": company_id})

    def _history(self, company_id, telegram_id):
        cursor = (
            self.store.leads.find({"company_id": company_id, "telegram_id": telegram_id, "deleted": {"$ne": True}})
            .sort("created_at", -1)
            .limit(HISTORY_LIMIT)
        )
        return list(reversed(list(cursor)))

    def _save(self, user, ctx, **fields):
        doc = {
            "company_id": user["company_id"],
            "telegram_id": ctx.telegram_id,
            "client_id": f"tg:{ctx.telegram_id}",
            "channel": "telegram",
            "username": ctx.username,
            "name": ctx.name,
            "contact": ctx.contact,
            "message": fields.get("notes"),
            "update_id": ctx.update_id,
            "created_at": self.clock(),
        }
        doc.update(fields)
        self.store.leads.insert_one(doc)
        return doc

    def _mark_answered(self, company_id, telegram_id):
        self.store.leads.update_many(
            {"company_id": company_id, "telegram_id": telegram_id, "answered": False},
            {"$set": {"answered": True}},
        )

    def _save_cart(self, telegram_id, company_id, items):
        self.store.user_sessions.update_one(
            {"telegram_id": telegram_id},
            {"$set": {f"carts.{company_id}": items, "updated_at": self.clock()}},
            upsert=True,
        )

    def _send(self, chat_id, text, reply_to=None):
        if not self.telegram:
            log.warning("TELEGRAM_TOKEN не задан — сообщение не отправлено")
            return False
        try:
            self.telegram.send_message(chat_id, text, reply_to)
            return True
        except TelegramError as exc:
            log.warning("Telegram sendMessage не удался: %s", exc)
            return False

    def _label(self, ctx):
        return f"{ctx.name} (@{ctx.username})" if ctx.username else f"{ctx.name} (ID {ctx.telegram_id})"

    def _notify_handoff(self, user, ctx, text, reason, draft=""):
        draft_line = f"\nAI хотел ответить: «{clip(draft, 300)}»" if draft else ""
        self._notify_owner(
            user,
            f"🙋 Нужен ваш ответ клиенту {self._label(ctx)}\nПричина: {reason}\nСообщение: «{clip(text, 300)}»"
            f"{draft_line}\n\n"
            f"Ответьте на сайте во «Входящих». Если не ответите за {self.config.manual_timeout_minutes} мин, "
            "AI продолжит диалог сам.",
            client_id=ctx.telegram_id,
        )

    def _client_safe(self, text):
        """Последний рубеж: служебный текст для владельца не уходит клиенту."""
        if text and INTERNAL_MARKERS_RE.search(text):
            log.warning("В сообщении клиенту найден служебный текст — заменён на нейтральный ответ")
            return CLIENT_HOLD_REPLY
        return text

    def _notify_owner(self, user, text, client_id=None):
        """Уведомление только владельцу. Оно никогда не сохраняется в историю клиента.
        Если владелец сам пишет боту как клиент (тестирует свой бот), уведомление о его же диалоге
        в этот чат не отправляем — иначе оно смешается с ответами клиенту. Оно остаётся в колокольчике на сайте."""
        owner_id = (user or {}).get("owner_telegram_id")
        if not owner_id:
            return
        if client_id is not None and str(owner_id) == str(client_id):
            log.info("Владелец пишет боту как клиент — уведомление о его диалоге в Telegram не отправлено")
            return
        self._send(owner_id, f"{OWNER_NOTICE_HEADER}\n{text}")


def background_ticker(assistant, interval_seconds, stop_event):
    """Фоновый поток: раз в interval секунд возвращает просроченные диалоги AI.
    Состояние хранится в MongoDB, поэтому перезапуск сервера ничего не теряет:
    после старта поток просто подхватит все просроченные диалоги."""
    while not stop_event.wait(interval_seconds):
        try:
            assistant.run_due_resumes()
        except Exception:  # noqa: BLE001
            log.exception("Ошибка фоновой задачи возврата диалогов")


def is_due(conv, now):
    resume_at = as_utc(conv.get("resume_at"))
    return conv.get("mode") == "manual" and resume_at is not None and resume_at <= now
