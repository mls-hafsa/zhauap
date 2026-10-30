import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  MessageSquare,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo, Pill, StatusBadge, type IconType } from "./common";

const FEATURES: [IconType, string, string][] = [
  [
    MessageSquare,
    "Все диалоги в одном окне",
    "Telegram уже работает, WhatsApp и Instagram — скоро.",
  ],
  [
    Bot,
    "Ответы по вашим данным",
    "Цены, наличие и условия — только из вашего каталога и базы знаний.",
  ],
  [UserCheck, "Сложное — владельцу", "Бот сам передаёт вам вопрос и напоминает, если клиент ждёт."],
  [BarChart3, "Понятный результат", "Сколько сообщений обработал бот и сколько ответили вы."],
];

const FAQ: [string, string][] = [
  [
    "Бот отвечает вместо меня?",
    "Да, на типовые вопросы по вашему каталогу и базе знаний. Если ответа в данных нет, бот передаёт вопрос вам.",
  ],
  [
    "Что если я не успею ответить?",
    "Если вы не ответите за 10 минут, AI продолжит диалог сам — строго по вашим данным, ничего не выдумывая.",
  ],
  [
    "Можно остановить бота?",
    "Да. В любом диалоге можно нажать «Перехватить» и ответить клиенту самому прямо с сайта.",
  ],
  [
    "Нужен ли отдельный номер?",
    "Нет. Клиенты пишут в Telegram по вашей персональной ссылке. Подключение других каналов появится позже.",
  ],
];

export function Landing() {
  const [faq, setFaq] = useState(0);
  return (
    <div className="min-h-screen overflow-hidden bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto] items-center px-4 sm:flex sm:px-6">
          <Logo />
          <nav className="hidden flex-1 justify-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">
              Как работает
            </a>
            <a href="#features" className="hover:text-foreground">
              Возможности
            </a>
            <a href="#pricing" className="hover:text-foreground">
              Тарифы
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden rounded-xl sm:inline-flex">
              <Link to="/login">Войти</Link>
            </Button>
            <Button asChild className="rounded-xl">
              <Link to="/register">Начать бесплатно</Link>
            </Button>
          </div>
        </div>
      </header>
      <main>
        <section className="relative mx-auto grid min-h-[680px] max-w-7xl items-center px-4 py-20 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:gap-14">
          <div className="pointer-events-none absolute inset-0 noise-grid opacity-25" />
          <div className="relative z-10">
            <Pill>
              <Sparkles className="size-3" />
              AI-администратор для Telegram
            </Pill>
            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-6xl lg:text-7xl">
              Отвечайте клиентам, пока заняты своим делом
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Zhauap отвечает клиентам по вашему каталогу, принимает чеки об оплате и передаёт вам
              сложные вопросы — а если вы заняты, продолжает диалог сам.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base">
                <Link to="/register">
                  Начать бесплатно <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-xl px-6 text-base"
              >
                <a href="#how">
                  <MessageSquare /> Как это работает
                </a>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Check className="size-4 text-primary" />
                14 дней бесплатно
              </span>
              <span className="flex items-center gap-2">
                <Check className="size-4 text-primary" />
                Без банковской карты
              </span>
            </div>
          </div>
          <div className="relative z-10 mt-14 lg:mt-0" aria-hidden="true">
            <div className="app-card active-glow overflow-hidden">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-info-soft text-info">
                    А
                  </div>
                  <div>
                    <p className="font-bold">Айгуль</p>
                    <p className="text-xs text-muted-foreground">Telegram · пример диалога</p>
                  </div>
                </div>
                <StatusBadge kind="bot" />
              </div>
              <div className="space-y-4 p-5">
                <div className="max-w-[78%] rounded-2xl rounded-bl-sm bg-secondary p-3 text-sm">
                  Здравствуйте! Сколько стоит окрашивание на длинные волосы?
                </div>
                <div className="mx-auto max-w-[86%] rounded-2xl border border-primary/25 bg-success-soft p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-primary">
                    <Bot className="size-4" />
                    БОТ
                  </div>
                  <p className="text-sm leading-6">
                    Здравствуйте, Айгуль! Окрашивание на длинные волосы — 18 000 ₸. Подсказать
                    свободное время?
                  </p>
                </div>
                <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-sm bg-primary p-3 text-sm text-primary-foreground">
                  Да, на субботу ✨
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="how" className="border-y border-border bg-surface py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <p className="text-sm font-bold uppercase text-primary">Просто начать</p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">
              Три шага — и Zhauap работает
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                [
                  "01",
                  "Расскажите о бизнесе",
                  "Добавьте товары и услуги, цены, график и частые вопросы — вручную или CSV.",
                ],
                [
                  "02",
                  "Дайте клиентам ссылку",
                  "Персональная ссылка на Telegram-бота — разместите её в профиле и сторис.",
                ],
                [
                  "03",
                  "Освободите время",
                  "Бот отвечает, а важные диалоги передаёт вам с уведомлением.",
                ],
              ].map((x) => (
                <div key={x[0]} className="app-card p-6">
                  <span className="text-3xl font-extrabold text-primary">{x[0]}</span>
                  <h3 className="mt-8 text-xl font-bold">{x[1]}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{x[2]}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-bold uppercase text-primary">Всегда на связи</p>
              <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">
                Не теряйте клиентов между сообщениями
              </h2>
              <p className="mt-4 max-w-lg text-muted-foreground">
                Одно окно для входящих и ответы по вашей базе — без выдуманных цен и обещаний.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {FEATURES.map(([Icon, title, text]) => (
                <div key={title} className="app-card p-5">
                  <Icon className="size-5 text-primary" />
                  <h3 className="mt-4 font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="pricing" className="border-y border-border bg-surface py-20">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-extrabold sm:text-4xl">Начните бесплатно на 14 дней</h2>
            <p className="mt-3 text-muted-foreground">
              Попробуйте на реальных диалогах. Карта не нужна.
            </p>
            <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
              {[
                ["Старт", "2 900 ₸", "Для одного мастера"],
                ["Стандарт", "6 900 ₸", "Для растущей студии"],
                ["Премиум", "14 900 ₸", "Для команды"],
              ].map((p, i) => (
                <div
                  key={p[0]}
                  className={cn(
                    "app-card relative p-6 text-left",
                    i === 1 && "border-primary active-glow",
                  )}
                >
                  {i === 1 && (
                    <span className="absolute right-4 top-4 rounded-full bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">
                      Популярный
                    </span>
                  )}
                  <h3 className="font-bold">{p[0]}</h3>
                  <p className="mt-5 text-3xl font-extrabold">
                    {p[1]} <span className="text-sm font-normal text-muted-foreground">/мес</span>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{p[2]}</p>
                  <Button
                    asChild
                    className="mt-6 w-full rounded-xl"
                    variant={i === 1 ? "default" : "outline"}
                  >
                    <Link to="/register">Попробовать бесплатно</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-extrabold">Частые вопросы</h2>
          <div className="mt-8 divide-y divide-border border-y border-border">
            {FAQ.map((x, i) => (
              <button
                key={x[0]}
                className="w-full py-5 text-left"
                aria-expanded={faq === i}
                onClick={() => setFaq(faq === i ? -1 : i)}
              >
                <span className="flex items-center justify-between gap-4 font-bold">
                  {x[0]}
                  <ChevronDown
                    className={cn("size-5 shrink-0 transition", faq === i && "rotate-180")}
                  />
                </span>
                {faq === i && (
                  <p className="mt-3 pr-8 text-sm leading-6 text-muted-foreground">{x[1]}</p>
                )}
              </button>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <p className="text-sm text-muted-foreground">
            © 2026 Zhauap. Сделано для малого бизнеса Казахстана.
          </p>
        </div>
      </footer>
    </div>
  );
}
