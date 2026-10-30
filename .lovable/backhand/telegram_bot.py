"""Локальный запуск бота в режиме long polling (без публичного адреса для webhook).

    python telegram_bot.py

В production (Render) используется webhook — см. app.py и zhauap/routes/system.py.
Перед polling webhook у бота удаляется, поэтому после локального теста
перезапустите сервис на Render, чтобы он снова зарегистрировал webhook.
"""

import logging
import time

from dotenv import load_dotenv

load_dotenv()

from zhauap import create_app  # noqa: E402
from zhauap.config import Config  # noqa: E402
from zhauap.integrations.telegram import TelegramError  # noqa: E402

log = logging.getLogger("zhauap.polling")


def main():
    config = Config(public_base_url=None)  # не регистрировать webhook при старте
    app = create_app(config)
    svc = app.extensions["zhauap"]
    if not svc.telegram:
        raise SystemExit("TELEGRAM_TOKEN не задан")
    svc.telegram.delete_webhook()
    log.info("Бот запущен в режиме long polling. Ctrl+C — выход.")
    offset = None
    while True:
        try:
            updates = svc.telegram.get_updates(offset=offset, timeout=25) or []
        except TelegramError as exc:
            log.warning("getUpdates: %s", exc)
            time.sleep(3)
            continue
        for update in updates:
            offset = update["update_id"] + 1
            with app.app_context():
                svc.assistant.process_update(update)


if __name__ == "__main__":
    main()
