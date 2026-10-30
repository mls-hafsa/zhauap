"""Точка входа backend Zhauap.

Render запускает этот файл (например `gunicorn app:app` или `python app.py`),
поэтому имя модуля и переменная `app` сохранены. Вся логика — в пакете zhauap/.
"""

import os

from dotenv import load_dotenv

load_dotenv()

from zhauap import create_app  # noqa: E402 — переменные окружения нужны до импорта

app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
