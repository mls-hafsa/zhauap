# Zhauap Client Connect

Build a complete, polished, production-quality web app UI for "Zhauap" — an AI assistant that answers customer messages in messengers for small service businesses (beauty masters, studios, tutors) and brings back clients who went silent. All interface text in Russian. Use clearly labeled mock data only ("Демо-данные" badge in the header) — no real backend.

DESIGN: premium dark SaaS, near-black navy background (#090D16), ONE electric emerald accent (#10B981), rounded 16px cards, subtle borders, soft glow only on active elements. Readability first: high contrast, minimum 14px text, dark text on light buttons, status badges with icon + text in distinct colors (green "Бот ответил", orange "Нужен владелец", blue "Владелец ведёт", gray "Ждём ответа"). Font with full Cyrillic incl. Kazakh letters (ә ғ қ ң ө ұ ү һ і). Fully responsive; sidebar becomes bottom navigation on mobile. Include loading, empty and error states. Use standard safe Lucide React icons (e.g., MessageSquare, Send, Camera, Globe, Settings, Users, CreditCard, Shield, BarChart3, HelpCircle) to prevent build or import errors.

PAGES (switchable via state or tabs in layout):
1. Public landing page: hero, how it works (3 steps), features, pricing, FAQ, footer, buttons "Начать бесплатно" and "Войти".
2. Auth: registration (name, email, password), login, "Забыл пароль" flow (enter email → "письмо отправлено" screen → set new password → success). Password rules shown live with checklist and strength meter: min 8 chars, uppercase, lowercase, digit, special character; show/hide toggle; confirm field.
3. Onboarding wizard: business type, working hours, services and prices, tone of replies, connect channels.
4. Channels page: cards for Telegram (connected, bot token field), WhatsApp (status "Скоро", tooltip about the 24-hour window and paid templates), Instagram ("Скоро").
5. Unified inbox: tabs by channel (Все / Telegram / WhatsApp / Instagram) with unread counters, channel icon on EVERY conversation, status filters, search.
6. Conversation page: channel badge, bubbles (client left, bot center labeled "Бот", owner right), highlighted AI draft card with "Отправить" / "Изменить", big "Перехватить" button, "Бот включён / Пауза" toggle, client side panel (name, channel, history, notes, "Записать" button).
7. Reminders (win-back): rules editor (delay before 1st and 2nd reminder, max 2, quiet hours, message templates), and a list of scheduled/sent/returned reminders.
8. Knowledge base: services with price and duration, schedule, rules (prepayment, cancellation), file upload for a price list.
9. Results: 4 stat cards, weekly bar chart, returned-clients ring chart, reminders list; every number labeled as demo.
10. Billing: 3 plans with monthly/annual toggle (annual = 2 months free): Старт 2 900 ₸ (Telegram, 300 AI replies, take-over), Стандарт 6 900 ₸ "Популярный" (2 channels, 1 500 replies, up to 2 reminders, knowledge base, results counter), Премиум 14 900 ₸ (3 channels, 5 000 replies, waiting list, 3 staff, 30 WhatsApp reminders included). 14-day free trial. Usage meters (AI replies, reminders), upgrade modal, invoices list (mock).
11. Settings: profile, language switch (Русский / Қазақша placeholder), notifications, security (change password), team members, delete account.

Keep components modular and clean, ensure no missing modules or invalid icon imports.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/77d739aa-ac95-48cb-ad54-19442a7f3b96).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
