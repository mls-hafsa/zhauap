# Zhauap

AI-администратор клиентской поддержки для малого бизнеса. Клиенты пишут в Telegram-бота
по персональной ссылке компании, AI отвечает строго по данным бизнеса (каталог, база знаний,
профиль), сложные вопросы передаёт владельцу, а если владелец не ответил за 10 минут —
продолжает диалог сам. Владелец работает в веб-кабинете.

## Архитектура

| Часть | Технологии | Где | Деплой |
| --- | --- | --- | --- |
| Сайт и кабинет | React 19, TanStack Start/Router, React Query, Tailwind 4 | `src/` | Vercel |
| API и бот | Python, Flask, gunicorn | `.lovable/backhand/` | Render |
| База | MongoDB Atlas (`zhauap_database`) | — | Atlas |
| AI | Gemini `generateContent`, JSON-ответ | `zhauap/integrations/gemini.py` | — |
| Мессенджер | Telegram Bot API, webhook | `zhauap/integrations/telegram.py` | — |

```
.lovable/backhand/
  app.py                 точка входа: gunicorn app:app
  telegram_bot.py        локальный запуск бота в режиме long polling
  zhauap/
    config.py            переменные окружения
    db.py                коллекции и индексы MongoDB
    security.py          сессии, CSRF, авторизация
    integrations/        клиенты Telegram и Gemini
    services/
      assistant.py       обработка сообщений бота, чеки, возврат AI по таймеру
      conversations.py   режим диалога бот/владелец, таймер, версии
      ai.py              промпт и серверные проверки ответа AI
      catalog.py         каталог, база знаний, импорт CSV
      accounts.py        пароли, лимиты входа, одноразовые коды
    routes/              HTTP API (auth, conversations, catalog, payments, settings, system)
  tests/                 pytest
src/
  routes/                страницы (файловая маршрутизация TanStack)
  components/zhauap/     экраны кабинета и лендинг
  lib/                   API-клиент, запросы, типы, утилиты
tests/                   тесты чистых функций frontend (node --test)
```

### Как связаны данные

1. Регистрация создаёт документ в `users` с `company_id` (это и есть компания).
2. Клиент открывает `t.me/<бот>?start=<company_id>` — в `user_sessions` запоминается его компания.
3. Каждое сообщение сохраняется в `leads` с `company_id` и стабильным `telegram_id`
   (`client_id = tg:<id>`), поэтому смена ника не раздваивает диалог.
4. Режим диалога (`bot`/`manual`), таймер `resume_at` и `version` лежат в `conversations`.
5. AI получает профиль бизнеса, каталог `services`, базу `knowledge_base` и историю
   только этой компании.

### Передача владельцу и таймер 10 минут

- AI сам ставит `needs_human`, если ответа нет в данных; клиент может попросить человека.
- Диалог переходит в ручной режим, владельцу приходит уведомление в Telegram (если привязан)
  и в колокольчик кабинета.
- Владелец отвечает с сайта; каждый его ответ даёт ещё 10 минут.
- Если клиент ждёт дольше 10 минут, AI отвечает на неотвеченные сообщения. Таймер хранится в
  MongoDB и переживает перезапуск сервера; его обрабатывают фоновый поток, любой входящий запрос
  и (рекомендуется) внешний планировщик `/api/internal/tick`.
- AI не отправит устаревший ответ, если владелец успел вмешаться: проверяется `version` диалога.

## Локальный запуск

### Backend

```sh
cd .lovable/backhand
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # заполните значения
python app.py                 # API на http://localhost:5000
```

Без публичного адреса Telegram не может прислать webhook. Для проверки бота локально:

```sh
python telegram_bot.py        # long polling; снимает webhook у бота
```

После локального теста перезапустите сервис на Render — он заново зарегистрирует webhook.

### Frontend

```sh
cp .env.example .env          # VITE_API_URL=http://localhost:5000
npm install
npm run dev                   # http://localhost:5173
```

## Тесты и проверки

```sh
npm run test:backend          # pytest: API, изоляция компаний, бот, AI, таймер, CSV, оплаты
npm test                      # тесты чистых функций frontend
npm run typecheck             # TypeScript
npm run lint                  # ESLint + Prettier
npm run build                 # продакшен-сборка
```

Backend-тесты используют mongomock и фейковые Telegram/Gemini — им не нужны ключи и сеть.

## Деплой

### Render (backend)

Настройки сервиса (справочно — в `render.yaml`):

- Root Directory: `.lovable/backhand`
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app --workers 1 --threads 8 --timeout 120 --bind 0.0.0.0:$PORT`
- Health Check Path: `/api/health`
- Переменные окружения — см. `.lovable/backhand/.env.example`.

При старте сервис сам регистрирует webhook `RENDER_EXTERNAL_URL/api/telegram/webhook`.
Проверка: `GET /api/health` должен вернуть `db_ok: true`, `telegram_configured: true`,
`gemini_configured: true`.

**Таймер возврата AI.** Работает в три слоя, все бесплатные:

1. Фоновый поток backend проверяет просроченные диалоги каждые 30 секунд. Он не зависит от
   сообщений клиента: любое событие передачи владельцу — это входящий запрос, после которого
   бесплатный Render не засыпает минимум 15 минут, то есть дольше 10-минутного таймера.
2. GitHub Actions (`.github/workflows/zhauap-tick.yml`) раз в ~5 минут вызывает
   `/api/internal/tick` — страховка после перезапусков. Нужно добавить секрет репозитория
   `INTERNAL_TICK_TOKEN` (Settings → Secrets and variables → Actions).
3. Для точности до минуты — задача на cron-job.org: `POST https://zhauap.onrender.com/api/internal/tick`
   раз в минуту с заголовком `X-Internal-Token: <INTERNAL_TICK_TOKEN>`.

### Vercel (frontend)

- `VITE_API_URL=/` — сайт ходит в API через прокси на своём домене (`src/routes/api/$.ts`).
  Cookie сессии становится «своим», поэтому вход работает в Safari/iPhone и инкогнито Chrome.
- `API_PROXY_TARGET=https://zhauap.onrender.com` — куда прокси пересылает `/api/*`
  (это значение по умолчанию, переменную можно не задавать).
- Сборка — как раньше (`npm run build`); на Vercel Nitro сам собирает серверную функцию,
  которая отдаёт все страницы (`/login`, `/app/inbox` и т.д.) и прокси `/api/*`.
- Если домен сайта меняется, добавьте его в `FRONTEND_ORIGINS` на Render. Для Preview-деплоев —
  `FRONTEND_ORIGIN_REGEX` с именем вашей команды Vercel.
- Старый режим без прокси (`VITE_API_URL=https://zhauap.onrender.com`) тоже работает, но в Safari
  вход не сохраняется.

## Переменные окружения

Backend: см. `.lovable/backhand/.env.example`. Обязательные: `FLASK_SECRET_KEY`, `MONGO_URI`,
`TELEGRAM_TOKEN`, `BOT_USERNAME`, `GEMINI_API_KEY`, `TELEGRAM_WEBHOOK_SECRET`.
Рекомендуемые: `INTERNAL_TICK_TOKEN`, `FRONTEND_ORIGINS`.

Frontend (Vercel): `VITE_API_URL=/`, при необходимости `API_PROXY_TARGET`.

## Lovable

Проект связан с [Lovable](https://lovable.dev/projects/77d739aa-ac95-48cb-ad54-19442a7f3b96):
коммиты в связанную ветку синхронизируются в редактор. Не переписывайте опубликованную историю
git (force push, rebase опубликованных коммитов).
