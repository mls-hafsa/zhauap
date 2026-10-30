"""Клиент Gemini generateContent с перебором моделей и общим дедлайном.

Ключ передаётся в заголовке x-goog-api-key, а не в URL, чтобы не попадать в
логи прокси и сообщения об ошибках.
"""

import json
import logging
import random
import re
import time

import requests

log = logging.getLogger(__name__)

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def parse_model_json(text):
    """Достаёт JSON-объект из ответа модели. Возвращает dict или None.

    Модель иногда оборачивает JSON в ```json ... ``` или добавляет текст до/после.
    Если объект достать не удалось, возвращаем None — вызывающий код НИКОГДА не
    отправляет такой сырой текст клиенту.
    """
    if not isinstance(text, str):
        return None
    cleaned = FENCE_RE.sub("", text.strip()).strip()
    candidates = [cleaned]
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start != -1 and end > start:
        candidates.append(cleaned[start : end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


class GeminiClient:
    def __init__(
        self,
        api_key,
        models,
        timeout=15,
        deadline=35,
        retries_per_model=2,
        session=None,
        sleep=time.sleep,
        monotonic=time.monotonic,
    ):
        self.api_key = api_key
        self.models = list(models)
        self.timeout = timeout
        self.deadline = deadline
        self.retries_per_model = retries_per_model
        self._session = session or requests.Session()
        self._sleep = sleep
        self._monotonic = monotonic

    @property
    def configured(self):
        return bool(self.api_key and self.models)

    def generate_json(self, system_text, contents, temperature=0.2):
        """Возвращает (dict, model_name) или (None, None), если ни одна модель не дала валидный JSON."""
        if not self.configured:
            return None, None

        body = {
            "contents": contents,
            "systemInstruction": {"parts": [{"text": system_text}]},
            "generationConfig": {"responseMimeType": "application/json", "temperature": temperature},
        }
        headers = {"Content-Type": "application/json", "x-goog-api-key": self.api_key}
        started = self._monotonic()

        for model in self.models:
            for attempt in range(1, self.retries_per_model + 1):
                remaining = self.deadline - (self._monotonic() - started)
                if remaining <= 1:
                    log.warning("Gemini: исчерпан бюджет времени %ss", self.deadline)
                    return None, None
                last_attempt = attempt == self.retries_per_model
                try:
                    response = self._session.post(
                        API_URL.format(model=model),
                        headers=headers,
                        json=body,
                        timeout=min(self.timeout, remaining),
                    )
                except requests.RequestException as exc:
                    log.warning("Gemini %s попытка %s: сетевая ошибка %s", model, attempt, type(exc).__name__)
                    if not last_attempt:
                        self._backoff(attempt)
                        continue
                    break

                if response.status_code == 429 or response.status_code >= 500:
                    log.warning("Gemini %s попытка %s: HTTP %s", model, attempt, response.status_code)
                    if not last_attempt:
                        self._backoff(attempt)
                        continue
                    break
                if response.status_code >= 400:
                    # 400/403/404 — неверная модель или ключ: повтор не поможет.
                    log.warning("Gemini %s: HTTP %s, перехожу к следующей модели", model, response.status_code)
                    break

                try:
                    payload = response.json()
                    raw_text = payload["candidates"][0]["content"]["parts"][0]["text"]
                except (ValueError, KeyError, IndexError, TypeError):
                    log.warning("Gemini %s: неожиданный формат ответа", model)
                    break

                parsed = parse_model_json(raw_text)
                if parsed is None:
                    log.warning("Gemini %s вернула не-JSON, пробую ещё раз", model)
                    if not last_attempt:
                        continue
                    break
                return parsed, model
        return None, None

    def _backoff(self, attempt):
        delay = 1.0 * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
        self._sleep(delay)
