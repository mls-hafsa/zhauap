"""Тонкий клиент Telegram Bot API поверх requests.

Отдельный класс вместо глобального telebot.TeleBot позволяет подменять его в
тестах и не требует токена при импорте модуля.
"""

import logging

import requests

log = logging.getLogger(__name__)

TELEGRAM_TEXT_LIMIT = 4096
TELEGRAM_CAPTION_LIMIT = 1024


class TelegramError(Exception):
    def __init__(self, description, error_code=None):
        super().__init__(description)
        self.description = description
        self.error_code = error_code


class TelegramClient:
    def __init__(self, token, timeout=15, session=None):
        if not token:
            raise ValueError("TELEGRAM_TOKEN не задан")
        self._token = token
        self._timeout = timeout
        self._session = session or requests.Session()

    @property
    def _base(self):
        return f"https://api.telegram.org/bot{self._token}"

    def _call(self, method, data=None, files=None, timeout=None):
        try:
            response = self._session.post(
                f"{self._base}/{method}",
                json=data if files is None else None,
                data=data if files is not None else None,
                files=files,
                timeout=timeout or self._timeout,
            )
        except requests.RequestException as exc:
            # Не логируем URL: в нём токен бота.
            raise TelegramError(f"network error: {type(exc).__name__}") from None
        try:
            payload = response.json()
        except ValueError:
            raise TelegramError(f"non-JSON response, HTTP {response.status_code}") from None
        if not payload.get("ok"):
            raise TelegramError(payload.get("description") or "unknown error", payload.get("error_code"))
        return payload.get("result")

    def send_message(self, chat_id, text, reply_to_message_id=None):
        data = {"chat_id": chat_id, "text": (text or "")[:TELEGRAM_TEXT_LIMIT]}
        if reply_to_message_id:
            data["reply_to_message_id"] = reply_to_message_id
            data["allow_sending_without_reply"] = True
        return self._call("sendMessage", data)

    def send_photo(self, chat_id, photo_bytes, caption=None, mime_type="image/png"):
        data = {"chat_id": str(chat_id)}
        if caption:
            data["caption"] = caption[:TELEGRAM_CAPTION_LIMIT]
        extension = "jpg" if "jpeg" in mime_type else mime_type.split("/")[-1]
        files = {"photo": (f"qr.{extension}", photo_bytes, mime_type)}
        return self._call("sendPhoto", data, files=files, timeout=30)

    def get_file_path(self, file_id):
        result = self._call("getFile", {"file_id": file_id})
        return result.get("file_path")

    def download_file(self, file_path):
        try:
            response = self._session.get(
                f"https://api.telegram.org/file/bot{self._token}/{file_path}", timeout=30
            )
        except requests.RequestException as exc:
            raise TelegramError(f"network error: {type(exc).__name__}") from None
        if response.status_code != 200:
            raise TelegramError(f"download failed, HTTP {response.status_code}")
        return response.content

    def set_webhook(self, url, secret_token=None):
        data = {
            "url": url,
            "drop_pending_updates": False,
            "allowed_updates": ["message"],
        }
        if secret_token:
            data["secret_token"] = secret_token
        return self._call("setWebhook", data)

    def delete_webhook(self):
        return self._call("deleteWebhook", {"drop_pending_updates": False})

    def get_updates(self, offset=None, timeout=25):
        data = {"timeout": timeout, "allowed_updates": ["message"]}
        if offset is not None:
            data["offset"] = offset
        return self._call("getUpdates", data, timeout=timeout + 10)
