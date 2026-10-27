import { useState, useMemo, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Inbox,
  Instagram,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchLeads,
  channelOf,
  channelIcon,
  statusKind,
  formatTime,
  type ChannelName,
  type Lead,
  getCompanyId,
} from "@/lib/leads";
import { registerUser, loginUser, logoutUser } from "@/integrations/supabase/client";

type View =
  | "landing"
  | "auth"
  | "onboarding"
  | "inbox"
  | "conversation"
  | "channels"
  | "catalog"
  | "knowledge"
  | "payments"
  | "results"
  | "billing"
  | "settings";

type IconType = typeof Inbox;

const TRIAL_DAYS_FRONTEND = 14;

const nav: { id: View; label: string; icon: IconType }[] = [
  { id: "inbox", label: "Входящие", icon: Inbox },
  { id: "channels", label: "Каналы", icon: MessageSquare },
  { id: "catalog", label: "Каталог", icon: RefreshCw },
  { id: "knowledge", label: "База знаний", icon: BookOpen },
  { id: "payments", label: "Оплаты", icon: Receipt },
  { id: "results", label: "Результаты", icon: BarChart3 },
  { id: "billing", label: "Тариф", icon: CreditCard },
  { id: "settings", label: "Настройки", icon: Settings },
];

const fieldClass =
  "h-11 w-full rounded-xl border border-input bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-muted-foreground";
const areaClass =
  "w-full rounded-xl border border-input bg-surface p-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-muted-foreground";

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Zap className="size-5" fill="currentColor" />
      </div>
      {!compact && <span className="text-xl font-extrabold">Zhauap</span>}
    </div>
  );
}

function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-success-soft px-2.5 py-1 text-xs font-bold text-primary">
      <Sparkles className="size-3" />
      MongoDB бэкенд
    </span>
  );
}

function StatusBadge({ kind }: { kind: string }) {
  const map: Record<string, { label: string; cls: string; icon: IconType }> = {
    bot: { label: "Бот ответил", cls: "bg-success-soft text-success", icon: CheckCircle2 },
    need: { label: "Нужен владелец", cls: "bg-warning-soft text-warning", icon: Bell },
    owner: { label: "Владелец ведёт", cls: "bg-info-soft text-info", icon: User },
    wait: { label: "Ждём ответа", cls: "bg-muted text-muted-foreground", icon: Clock3 },
  };
  const item = map[kind] ?? {
    label: "Ждём ответа",
    cls: "bg-muted text-muted-foreground",
    icon: Clock3,
  };
  const Icon = item.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        item.cls,
      )}
    >
      <Icon className="size-3" />
      {item.label}
    </span>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function Landing({ go }: { go: (v: View) => void }) {
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
            <Button
              variant="ghost"
              className="hidden rounded-xl sm:inline-flex"
              onClick={() => go("auth")}
            >
              Войти
            </Button>
            <Button className="rounded-xl" onClick={() => go("auth")}>
              Начать бесплатно
            </Button>
          </div>
        </div>
      </header>
      <main>
        <section className="relative mx-auto grid min-h-[680px] max-w-7xl items-center px-4 py-20 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:gap-14">
          <div className="pointer-events-none absolute inset-0 noise-grid opacity-25" />
          <div className="relative z-10">
            <DemoBadge />
            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.08] sm:text-6xl lg:text-7xl">
              Отвечайте клиентам, пока заняты своим делом
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Zhauap ведёт диалоги в мессенджерах, записывает клиентов и мягко возвращает тех, кто
              перестал отвечать.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="h-12 rounded-xl px-6 text-base"
                onClick={() => go("auth")}
              >
                Начать бесплатно <ArrowRight />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-xl px-6 text-base"
                onClick={() => go("inbox")}
              >
                <MessageSquare /> Смотреть демо
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
          <div className="relative z-10 mt-14 lg:mt-0">
            <div className="app-card active-glow overflow-hidden">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-info-soft text-info">
                    А
                  </div>
                  <div>
                    <p className="font-bold">Айгуль</p>
                    <p className="text-xs text-muted-foreground">Telegram · сейчас</p>
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
                    Здравствуйте, Айгуль! Окрашивание стоит от 18 000 ₸. Могу предложить свободное
                    время в четверг в 15:00 или субботу в 11:00.
                  </p>
                </div>
                <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-sm bg-primary p-3 text-sm text-primary-foreground">
                  Давайте в субботу ✨
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
                  "Подключите канал",
                  "Добавьте Telegram за пару минут — без сложных настроек.",
                ],
                ["02", "Расскажите о бизнесе", "Укажите услуги, цены, график и правила записи."],
                ["03", "Освободите время", "Бот отвечает, а важные диалоги передаёт вам."],
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
                Одно окно для входящих, умные ответы по вашей базе и аккуратные напоминания без
                навязчивости.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [MessageSquare, "Все диалоги", "Telegram, WhatsApp и Instagram в одном месте."],
                [Bot, "Ответы по вашим правилам", "Цены, график и условия всегда актуальны."],
                [RefreshCw, "Возврат клиентов", "До двух персональных напоминаний вовремя."],
                [
                  BarChart3,
                  "Понятный результат",
                  "Смотрите, сколько диалогов и записей вернул Zhauap.",
                ],
              ].map(([I, t, d]) => {
                const Icon = I as IconType;
                return (
                  <div key={String(t)} className="app-card p-5">
                    <Icon className="size-5 text-primary" />
                    <h3 className="mt-4 font-bold">{String(t)}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{String(d)}</p>
                  </div>
                );
              })}
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
                    className="mt-6 w-full rounded-xl"
                    variant={i === 1 ? "default" : "outline"}
                    onClick={() => go("auth")}
                  >
                    Попробовать бесплатно
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-extrabold">Частые вопросы</h2>
          <div className="mt-8 divide-y divide-border border-y border-border">
            {[
              [
                "Бот отвечает вместо меня?",
                "Да, на типовые вопросы по вашей базе. Сложные ситуации сразу отмечает и передаёт вам.",
              ],
              [
                "Можно остановить бота?",
                "Да. В любом диалоге можно нажать «Перехватить» или поставить бота на паузу.",
              ],
              [
                "Нужен ли отдельный номер?",
                "Для Telegram достаточно создать бота. Подключение других каналов появится позже.",
              ],
            ].map((x, i) => (
              <button
                key={x[0]}
                className="w-full py-5 text-left"
                onClick={() => setFaq(faq === i ? -1 : i)}
              >
                <span className="flex items-center justify-between gap-4 font-bold">
                  {x[0]}
                  <ChevronDown className={cn("size-5 transition", faq === i && "rotate-180")} />
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
          <div className="flex gap-4 text-sm text-muted-foreground">
            <a href="#">Конфиденциальность</a>
            <a href="#">Поддержка</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AuthPage({ go }: { go: (v: View) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "sent" | "reset" | "success">(
    "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [businessName, setBusinessName] = useState("");

  const rules = [
    ["Не менее 8 символов", password.length >= 8],
    [
      "Заглавная и строчная буквы",
      /[A-ZА-ЯӘҒҚҢӨҰҮҺІ]/.test(password) && /[a-zа-яәғқңөұүһі]/.test(password),
    ],
    ["Цифра", /\d/.test(password)],
    ["Спецсимвол", /[!@#$%^&*]/.test(password)],
  ] as const;
  const strength = rules.filter((r) => r[1]).length * 25;
  const title = {
    login: "С возвращением",
    register: "Создайте аккаунт",
    forgot: "Восстановить пароль",
    sent: "Письмо отправлено",
    reset: "Новый пароль",
    success: "Пароль обновлён",
  }[mode];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    try {
      if (mode === "register") {
        const data = await registerUser(email, password, businessName);
        if (data.error) {
          setErrorMsg(data.error);
        } else {
          go("onboarding");
        }
      } else if (mode === "login") {
        const data = await loginUser(email, password);
        if (data.error) {
          setErrorMsg(data.error);
        } else {
          go("inbox");
        }
      } else if (mode === "forgot") {
        setMode("sent");
      } else if (mode === "reset") {
        setMode("success");
      }
    } catch (err) {
      setErrorMsg("Ошибка соединения с сервером Python.");
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[.9fr_1.1fr]">
      <div className="hidden border-r border-border bg-surface p-12 lg:flex lg:flex-col">
        <Logo />
        <div className="my-auto max-w-lg">
          <div className="grid size-12 place-items-center rounded-2xl bg-success-soft text-primary">
            <Bot />
          </div>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight">
            Ваш бизнес отвечает быстро. Даже когда вы заняты.
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            Zhauap берёт рутину на себя и вовремя возвращает важные диалоги владельцу.
          </p>
        </div>
        <DemoBadge />
      </div>
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <button
            onClick={() => go("landing")}
            className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            На главную
          </button>
          <div className="app-card p-5 sm:p-8">
            <div className="mb-7 lg:hidden">
              <Logo />
            </div>
            <h2 className="text-2xl font-extrabold">{title}</h2>

            {errorMsg && (
              <div className="mt-3 rounded-xl bg-red-100 p-3 text-sm text-red-600">{errorMsg}</div>
            )}

            {mode === "sent" || mode === "success" ? (
              <div className="py-8 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft text-success">
                  <CheckCircle2 />
                </div>
                <p className="mt-5 text-sm leading-6 text-muted-foreground">
                  {mode === "sent"
                    ? "Мы отправили ссылку на почту. Откройте письмо, чтобы продолжить."
                    : "Теперь можно войти с новым паролем."}
                </p>
                <Button
                  className="mt-6 w-full rounded-xl"
                  onClick={() => setMode(mode === "sent" ? "reset" : "login")}
                >
                  {mode === "sent" ? "Открыть демо-ссылку" : "Войти"}
                </Button>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                {mode === "register" && (
                  <Field
                    label="Название бизнеса"
                    placeholder="Например, Кондитерская «Медовик»"
                    onChange={setBusinessName}
                  />
                )}
                <Field
                  label="Email"
                  placeholder="you@example.com"
                  type="email"
                  onChange={setEmail}
                />
                {mode !== "forgot" && (
                  <>
                    <Field
                      label="Пароль"
                      placeholder="Введите пароль"
                      type={show ? "text" : "password"}
                      right={
                        <button
                          type="button"
                          onClick={() => setShow(!show)}
                          className="text-xs text-muted-foreground"
                        >
                          {show ? "Скрыть" : "Показать"}
                        </button>
                      }
                      onChange={setPassword}
                    />
                    {(mode === "register" || mode === "reset") && (
                      <>
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${strength}%` }}
                          />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {rules.map((r) => (
                            <span
                              key={r[0]}
                              className={cn(
                                "flex items-center gap-2 text-xs",
                                r[1] ? "text-success" : "text-muted-foreground",
                              )}
                            >
                              <Check className="size-3" />
                              {r[0]}
                            </span>
                          ))}
                        </div>
                        <Field
                          label="Повторите пароль"
                          placeholder="Ещё раз"
                          type={show ? "text" : "password"}
                        />
                      </>
                    )}
                  </>
                )}
                <Button className="h-11 w-full rounded-xl" type="submit">
                  {mode === "login"
                    ? "Войти"
                    : mode === "register"
                      ? "Создать аккаунт"
                      : mode === "forgot"
                        ? "Отправить ссылку"
                        : "Сохранить пароль"}
                </Button>
              </form>
            )}

            {mode === "login" && (
              <>
                <button className="mt-4 text-sm text-primary" onClick={() => setMode("forgot")}>
                  Забыл пароль
                </button>
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Нет аккаунта?{" "}
                  <button className="font-bold text-primary" onClick={() => setMode("register")}>
                    Зарегистрироваться
                  </button>
                </p>
              </>
            )}
            {mode === "register" && (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Уже есть аккаунт?{" "}
                <button className="font-bold text-primary" onClick={() => setMode("login")}>
                  Войти
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  type = "text",
  right,
  onChange,
}: {
  label: string;
  placeholder: string;
  type?: string;
  right?: ReactNode;
  onChange?: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <span className="relative block">
        <input
          className={fieldClass}
          type={type}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
        />
        {right && <span className="absolute right-3 top-1/2 -translate-y-1/2">{right}</span>}
      </span>
    </label>
  );
}

function Onboarding({ go }: { go: (v: View) => void }) {
  const [step, setStep] = useState(0);
  const [services, setServices] = useState([
    { name: "Окрашивание", price: "18 000 ₸" },
    { name: "Стрижка", price: "8 000 ₸" },
  ]);
  const [saving, setSaving] = useState(false);
  const steps = ["Ваш бизнес", "График работы", "Услуги и цены", "Стиль ответов", "Подключение"];

  const updateService = (index: number, field: "name" | "price", value: string) => {
    setServices((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };
  const addService = () => setServices((prev) => [...prev, { name: "", price: "" }]);

  const saveServicesAndContinue = async () => {
    setSaving(true);
    try {
      for (const s of services) {
        if (s.name.trim() && s.price.trim()) {
          await fetch(apiUrl("/api/services"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name: s.name.trim(), price: s.price.trim() }),
          });
        }
      }
    } catch {
      // не блокируем онбординг, если сохранение услуг не удалось — просто идём дальше
    } finally {
      setSaving(false);
      setStep(step + 1);
    }
  };
  return (
    <div className="min-h-screen p-4 sm:p-8">
      <header className="mx-auto flex max-w-5xl items-center justify-between">
        <Logo />
        <DemoBadge />
      </header>
      <main className="mx-auto mt-12 max-w-3xl">
        <div className="mb-8 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold",
                  i <= step
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {i < step ? <Check className="size-4" /> : i + 1}
              </div>
              <span className="hidden text-xs text-muted-foreground md:block">{s}</span>
            </div>
          ))}
        </div>
        <div className="app-card p-6 sm:p-8">
          <p className="text-sm font-bold text-primary">Шаг {step + 1} из 5</p>
          <h1 className="mt-2 text-2xl font-extrabold">{steps[step]}</h1>
          <div className="mt-7 min-h-72">
            {step === 0 && (
              <ChoiceGrid items={["Бьюти-мастер", "Студия красоты", "Репетитор", "Другое"]} />
            )}
            {step === 1 && (
              <div className="space-y-3">
                {["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"].map(
                  (d, i) => (
                    <div
                      key={d}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-border p-3"
                    >
                      <span className="text-sm font-semibold">{d}</span>
                      <input
                        className="w-20 rounded-lg bg-secondary p-2 text-sm"
                        defaultValue="09:00"
                      />
                      <input
                        className="w-20 rounded-lg bg-secondary p-2 text-sm"
                        defaultValue={i === 5 ? "15:00" : "19:00"}
                      />
                    </div>
                  ),
                )}
              </div>
            )}
            {step === 2 && (
              <div className="space-y-3">
                {services.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_120px] gap-3">
                    <input
                      className={fieldClass}
                      value={s.name}
                      placeholder="Название услуги"
                      onChange={(e) => updateService(i, "name", e.target.value)}
                    />
                    <input
                      className={fieldClass}
                      value={s.price}
                      placeholder="Цена"
                      onChange={(e) => updateService(i, "price", e.target.value)}
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" className="rounded-xl" onClick={addService}>
                  <Plus />
                  Добавить услугу
                </Button>
              </div>
            )}
            {step === 3 && (
              <ChoiceGrid
                items={["Тёплый и заботливый", "Деловой и краткий", "Дружелюбный", "Свой вариант"]}
              />
            )}
            {step === 4 && (
              <div className="space-y-3">
                <ChannelRow
                  icon={Send}
                  title="Telegram"
                  detail="Персональная ссылка для клиентов — в разделе «Каналы»"
                />
                <ChannelRow icon={MessageCircle} title="WhatsApp" detail="Скоро" />
                <ChannelRow icon={Instagram} title="Instagram" detail="Скоро" />
              </div>
            )}
          </div>
          <div className="mt-7 flex justify-between">
            <Button
              variant="ghost"
              className="rounded-xl"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft />
              Назад
            </Button>
            <Button
              className="rounded-xl"
              disabled={saving}
              onClick={() => {
                if (step === 2) {
                  saveServicesAndContinue();
                } else if (step < 4) {
                  setStep(step + 1);
                } else {
                  go("inbox");
                }
              }}
            >
              {step === 2 && saving ? "Сохраняю…" : step < 4 ? "Продолжить" : "Открыть Zhauap"}
              <ArrowRight />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ChoiceGrid({ items }: { items: string[] }) {
  const [selected, setSelected] = useState(0);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((x, i) => (
        <button
          key={x}
          onClick={() => setSelected(i)}
          className={cn(
            "rounded-2xl border p-5 text-left text-sm font-bold transition",
            selected === i
              ? "border-primary bg-success-soft text-primary active-glow"
              : "border-border bg-surface hover:border-muted-foreground",
          )}
        >
          {x}
          {selected === i && <CheckCircle2 className="mt-5 size-5" />}
        </button>
      ))}
    </div>
  );
}

function ChannelRow({
  icon: Icon,
  title,
  detail,
}: {
  icon: IconType;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-4">
      <div className="grid size-10 place-items-center rounded-xl bg-secondary">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

async function fetchMe(): Promise<{
  trial_days_left: number;
  trial_active: boolean;
  business_name: string;
}> {
  const response = await fetch(apiUrl("/api/me"), { credentials: "include" });
  if (!response.ok) throw new Error("Не удалось получить данные аккаунта");
  return response.json();
}

function AppShell({
  view,
  go,
  children,
}: {
  view: View;
  go: (v: View) => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const queryClientForLogout = useQueryClient();
  const logout = async () => {
    await logoutUser();
    queryClientForLogout.clear();
    go("landing");
  };
  // Тот же queryKey ["leads"], что у InboxPage — React Query переиспользует кэш, лишнего запроса не будет
  const { data: leadsForBadge } = useQuery({ queryKey: ["leads"], queryFn: fetchLeads });
  const waitingCount = leadsForBadge?.filter((l) => statusKind(l.status) === "wait").length ?? 0;
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const trialLeft = me?.trial_days_left ?? TRIAL_DAYS_FRONTEND;
  const trialPercent = Math.max(0, Math.min(100, (trialLeft / TRIAL_DAYS_FRONTEND) * 100));

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="flex h-12 items-center justify-between">
          <Logo />
          <button className="text-muted-foreground">
            <Menu className="size-5" />
          </button>
        </div>
        <div className="mt-6">
          <DemoBadge />
        </div>
        <nav className="mt-6 space-y-1">
          {nav.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={view === item.id || (view === "conversation" && item.id === "inbox")}
              badge={item.id === "inbox" ? waitingCount : undefined}
              onClick={() => go(item.id)}
            />
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-border bg-background p-4">
          <p className="text-sm font-bold">Пробный период</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {me ? (trialLeft > 0 ? `Осталось ${trialLeft} дн.` : "Истёк") : "Загрузка…"}
          </p>
          <Progress value={trialPercent} className="mt-3 h-1.5" />
          <Button className="mt-4 w-full rounded-xl" size="sm" onClick={() => go("billing")}>
            Выбрать тариф
          </Button>
        </div>
        <button
          onClick={logout}
          className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="size-4" />
          Выйти
        </button>
      </aside>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur md:ml-64 md:px-7">
        <div className="md:hidden">
          <Logo compact />
        </div>
        <div className="hidden text-sm font-semibold md:block">
          {me?.business_name ?? getBusinessName()}
        </div>
        <div className="flex items-center gap-3">
          <DemoBadge />
          <button className="grid size-9 place-items-center rounded-xl border border-border text-muted-foreground">
            <Bell className="size-4" />
          </button>
          <div className="grid size-9 place-items-center rounded-full bg-info-soft text-sm font-bold text-info">
            К
          </div>
        </div>
      </header>
      <main className="md:ml-64">
        <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-surface/95 px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur md:hidden">
        {nav.slice(0, 4).map((item) => (
          <button
            key={item.id}
            onClick={() => go(item.id)}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-lg py-2 text-[10px]",
              view === item.id ? "text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
        <button
          onClick={() => setMenu(!menu)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-lg py-2 text-[10px]",
            menu ? "text-primary" : "text-muted-foreground",
          )}
        >
          <MoreHorizontal className="size-5" />
          Ещё
        </button>
      </nav>
      {menu && (
        <div className="fixed inset-x-3 bottom-20 z-50 app-card p-2 shadow-2xl md:hidden">
          {nav.slice(4).map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={view === item.id}
              onClick={() => {
                go(item.id);
                setMenu(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NavButton({
  item,
  active,
  badge,
  onClick,
}: {
  item: { id: View; label: string; icon: IconType };
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
        active
          ? "bg-success-soft text-primary active-glow"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <item.icon className="size-4" />
      {item.label}
      {!!badge && (
        <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

async function deleteConversation(contact: string) {
  const response = await fetch(apiUrl(`/api/leads/by-contact/${encodeURIComponent(contact)}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Не удалось удалить диалог");
  return response.json();
}

function InboxPage({
  go,
  onOpenLead,
}: {
  go: (v: View) => void;
  onOpenLead: (lead: Lead) => void;
}) {
  const [tab, setTab] = useState<"Все" | ChannelName>("Все");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads,
    refetchInterval: 5000,
  });
  const allLeads = data ?? [];

  const leads = useMemo(() => {
    const latestByContact = new Map<string, Lead>();
    for (const l of allLeads) {
      const key = l.contact ?? l.id;
      const existing = latestByContact.get(key);
      if (!existing || new Date(l.created_at).getTime() > new Date(existing.created_at).getTime()) {
        latestByContact.set(key, l);
      }
    }
    return Array.from(latestByContact.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [allLeads]);

  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const counts = { Все: leads.length, Telegram: 0, WhatsApp: 0, Instagram: 0 } as Record<
    string,
    number
  >;
  leads.forEach((l) => {
    const ch = channelOf(l.contact);
    if (ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
  });
  const visible = leads.filter((l) => {
    const ch = channelOf(l.contact);
    if (tab !== "Все" && ch !== tab) return false;
    if (status !== "all" && statusKind(l.status) !== status) return false;
    const text = `${l.name ?? ""} ${l.contact ?? ""} ${l.notes ?? ""}`.toLowerCase();
    return text.includes(q.trim().toLowerCase());
  });
  return (
    <>
      <SectionHeader
        title="Входящие"
        subtitle="Один диалог на клиента, новые сверху"
        action={
          <Button className="rounded-xl" variant="outline" onClick={() => refetch()}>
            <RefreshCw />
            Обновить
          </Button>
        }
      />
      <div className="mt-6 app-card overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["Все", "Telegram", "WhatsApp", "Instagram"] as const).map((x) => (
              <button
                key={x}
                onClick={() => setTab(x)}
                className={cn(
                  "shrink-0 rounded-xl px-3 py-2 text-sm font-semibold",
                  tab === x
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {x} <span className="ml-1 opacity-70">{counts[x] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className={cn(fieldClass, "pl-9")}
                placeholder="Найти клиента или заметку"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={cn(fieldClass, "sm:w-48")}
            >
              <option value="all">Все статусы</option>
              <option value="bot">Бот ответил</option>
              <option value="need">Нужен владелец</option>
              <option value="owner">Владелец ведёт</option>
              <option value="wait">Ждём ответа</option>
            </select>
            <button className="grid h-11 w-11 place-items-center rounded-xl border border-border">
              <SlidersHorizontal className="size-4" />
            </button>
          </div>
        </div>
        {isPending ? (
          <DataState state="loading" retry={() => refetch()} />
        ) : isError ? (
          <DataState state="error" retry={() => refetch()} />
        ) : visible.length === 0 ? (
          <DataState state="empty" retry={() => refetch()} />
        ) : (
          <div>
            {visible.map((l, i) => {
              const ch = channelOf(l.contact);
              const Icon = channelIcon(ch);
              const name = l.name ?? "Без имени";
              return (
                <div
                  key={l.id}
                  className={cn(
                    "grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border p-4 transition hover:bg-secondary/40",
                    i === 0 && "bg-success-soft/50",
                  )}
                >
                  <button onClick={() => onOpenLead(l)} className="contents text-left">
                    <div className="relative grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-bold">
                      {name.charAt(0)}
                      <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-card bg-surface-raised">
                        <Icon className="size-3 text-primary" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-bold">{name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{ch}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {l.notes ?? l.contact ?? "Без заметок"}
                      </p>
                      <div className="mt-2">
                        <StatusBadge kind={statusKind(l.status)} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{formatTime(l.created_at)}</p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (l.contact && confirm(`Удалить весь диалог с «${name}»?`))
                        deleteMutation.mutate(l.contact);
                    }}
                    className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function DataState({ state, retry }: { state: "loading" | "empty" | "error"; retry: () => void }) {
  if (state === "loading")
    return (
      <div className="space-y-4 p-5">
        {[1, 2, 3].map((x) => (
          <div key={x} className="flex gap-3">
            <div className="size-11 rounded-full bg-secondary skeleton-pulse" />
            <div className="flex-1">
              <div className="h-4 w-1/3 rounded bg-secondary skeleton-pulse" />
              <div className="mt-3 h-3 w-2/3 rounded bg-secondary skeleton-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  const empty = state === "empty";
  return (
    <div className="p-14 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
        {empty ? <Inbox /> : <RefreshCw />}
      </div>
      <h3 className="mt-4 font-bold">
        {empty ? "Здесь пока тихо" : "Не удалось загрузить диалоги"}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {empty
          ? "Новые сообщения появятся в этом списке."
          : "Проверьте соединение и попробуйте ещё раз."}
      </p>
      {!empty && (
        <Button variant="outline" className="mt-5 rounded-xl" onClick={retry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

async function fetchConversationMode(contact: string): Promise<{ contact: string; mode: string }> {
  const response = await fetch(apiUrl(`/api/conversations/${encodeURIComponent(contact)}`), {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Не удалось получить режим диалога");
  return response.json();
}

async function setConversationMode(contact: string, mode: "bot" | "manual") {
  const response = await fetch(apiUrl(`/api/conversations/${encodeURIComponent(contact)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ mode }),
  });
  if (!response.ok) throw new Error("Не удалось переключить режим");
  return response.json();
}

async function sendManualReply(contact: string, message: string) {
  const response = await fetch(apiUrl(`/api/conversations/${encodeURIComponent(contact)}/send`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ message }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Не удалось отправить сообщение");
  }
  return response.json();
}

function Conversation({ go, lead }: { go: (v: View) => void; lead: Lead | null }) {
  const queryClient = useQueryClient();
  const contact = lead?.contact ?? "";

  const { data: modeData } = useQuery({
    queryKey: ["conversation-mode", contact],
    queryFn: () => fetchConversationMode(contact),
    enabled: !!contact,
  });
  const bot = (modeData?.mode ?? "bot") === "bot";

  const modeMutation = useMutation({
    mutationFn: (mode: "bot" | "manual") => setConversationMode(contact, mode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversation-mode", contact] }),
  });

  if (!lead) {
    return (
      <div>
        <button
          onClick={() => go("inbox")}
          className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />К диалогам
        </button>
        <div className="app-card p-10 text-center">
          <h2 className="text-xl font-bold">Диалог не выбран</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Открой любой диалог из списка «Входящие».
          </p>
        </div>
      </div>
    );
  }

  const channel = channelOf(lead.contact);
  const name = lead.name ?? "Без имени";
  const initial = name.charAt(0).toUpperCase();

  const { data: allLeads } = useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads,
    refetchInterval: 5000,
  });
  const thread = (allLeads ?? [])
    .filter((l) => l.contact === contact)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const [replyText, setReplyText] = useState("");
  const sendMutation = useMutation({
    mutationFn: () => sendManualReply(contact, replyText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setReplyText("");
    },
  });

  return (
    <div>
      <button
        onClick={() => go("inbox")}
        className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />К диалогам
      </button>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="app-card flex min-h-[690px] flex-col overflow-hidden">
          <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-info-soft font-bold text-info">
                {initial}
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-bold">{name}</h1>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Send className="size-3 text-primary" />
                  {channel}
                  {lead.contact ? ` · ${lead.contact}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-xs text-muted-foreground">
                  {bot ? "Бот включён" : "Перехвачено"}
                </span>
                <Switch
                  checked={bot}
                  onCheckedChange={(checked) => modeMutation.mutate(checked ? "bot" : "manual")}
                />
              </div>
              <Button
                className="rounded-xl"
                variant={bot ? "default" : "outline"}
                onClick={() => modeMutation.mutate(bot ? "manual" : "bot")}
              >
                <User />
                {bot ? "Перехватить" : "Вернуть боту"}
              </Button>
            </div>
          </header>
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            {thread.length === 0 ? (
              <div className="mx-auto w-fit rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                Переписки пока нет
              </div>
            ) : (
              thread.map((item) => (
                <div key={item.id} className="space-y-2">
                  {item.notes && (
                    <Bubble side="left" time={formatTime(item.created_at)}>
                      {item.notes}
                    </Bubble>
                  )}
                  {item.ai_response && (
                    <Bubble
                      side="center"
                      time={formatTime(item.created_at)}
                      label={item.answer_source === "owner" ? "Вы" : "Бот"}
                    >
                      {item.ai_response}
                    </Bubble>
                  )}
                </div>
              ))
            )}
          </div>
          <footer className="border-t border-border p-4">
            <div className="flex items-end gap-2">
              <button className="grid size-11 shrink-0 place-items-center rounded-xl border border-border">
                <Paperclip className="size-4" />
              </button>
              <textarea
                className={cn(areaClass, "min-h-11 resize-none")}
                rows={1}
                placeholder={
                  bot ? "Сначала нажми «Перехватить», чтобы писать вручную" : "Написать сообщение…"
                }
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={bot}
              />
              <Button
                size="icon"
                className="size-11 shrink-0 rounded-xl"
                disabled={bot || !replyText.trim() || sendMutation.isPending}
                onClick={() => sendMutation.mutate()}
              >
                <Send />
              </Button>
            </div>
            {sendMutation.isError && (
              <p className="mt-2 text-xs text-destructive">
                {(sendMutation.error as Error).message}
              </p>
            )}
          </footer>
        </section>
        <ClientPanel lead={lead} />
      </div>
    </div>
  );
}

function Bubble({
  side,
  time,
  bot,
  label,
  children,
}: {
  side: "left" | "center";
  time: string;
  bot?: boolean;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-2xl p-3 text-sm leading-6 sm:max-w-[70%]",
        side === "left"
          ? "mr-auto rounded-bl-sm bg-secondary"
          : "mx-auto border border-primary/20 bg-success-soft",
      )}
    >
      {(bot || label) && (
        <span className="mb-1 flex items-center justify-center gap-1 text-xs font-bold text-primary">
          <Bot className="size-3" />
          {label ?? "Бот"}
        </span>
      )}
      <p>{children}</p>
      <p className="mt-1 text-right text-[11px] text-muted-foreground">{time}</p>
    </div>
  );
}

function ClientPanel({ lead }: { lead: Lead }) {
  const channel = channelOf(lead.contact);
  const name = lead.name ?? "Без имени";
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <aside className="app-card h-fit p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Клиент</h2>
        <button>
          <MoreHorizontal className="size-5 text-muted-foreground" />
        </button>
      </div>
      <div className="mt-5 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-info-soft text-xl font-bold text-info">
          {initials}
        </div>
        <h3 className="mt-3 font-bold">{name}</h3>
        <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Send className="size-3" />
          {channel}
        </span>
      </div>
      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
        <div>
          <p className="text-muted-foreground">Контакт</p>
          <p className="font-semibold">{lead.contact ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Сообщение</p>
          <p className="font-semibold">{lead.notes ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Обратился</p>
          <p className="font-semibold">{formatTime(lead.created_at) || "—"}</p>
        </div>
      </div>
    </aside>
  );
}

function BillingPage() {
  const plans = [
    { name: "Старт", price: "2 900 ₸", desc: "Для одного мастера" },
    { name: "Стандарт", price: "6 900 ₸", desc: "Для растущей студии" },
    { name: "Премиум", price: "14 900 ₸", desc: "Для команды" },
  ];
  return (
    <>
      <SectionHeader title="Тариф" subtitle="Оплата пока не подключена — цены ознакомительные" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {plans.map((p, i) => (
          <div key={p.name} className={cn("app-card p-6", i === 1 && "border-primary active-glow")}>
            <h3 className="font-bold">{p.name}</h3>
            <p className="mt-4 text-3xl font-extrabold">
              {p.price} <span className="text-sm font-normal text-muted-foreground">/мес</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
            <Button
              className="mt-6 w-full rounded-xl"
              variant={i === 1 ? "default" : "outline"}
              disabled
            >
              Оплата скоро
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

type Stats = {
  total_leads: number;
  total_bot_replies: number;
  active_leads: number;
};

async function fetchStats(): Promise<Stats> {
  const response = await fetch(apiUrl("/api/stats"), { credentials: "include" });
  if (!response.ok) throw new Error("Не удалось загрузить статистику");
  return response.json();
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="app-card p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-extrabold">{value}</p>
    </div>
  );
}

function ResultsPage() {
  const { data, isPending, isError } = useQuery({ queryKey: ["stats"], queryFn: fetchStats });
  return (
    <>
      <SectionHeader title="Результаты" subtitle="Сводная статистика по обращениям клиентов" />
      {isPending ? (
        <div className="mt-6 app-card p-10 text-center text-sm text-muted-foreground">
          Загрузка…
        </div>
      ) : isError || !data ? (
        <div className="mt-6 app-card p-10 text-center text-sm text-muted-foreground">
          Не удалось загрузить статистику
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Всего сообщений" value={data.total_leads} />
          <StatCard label="Обработал ИИ" value={data.total_bot_replies} />
          <StatCard label="Активные клиенты" value={data.active_leads} />
        </div>
      )}
    </>
  );
}

function ChannelsPage() {
  const [copied, setCopied] = useState(false);
  let link = "";
  try {
    link = localStorage.getItem("telegram_link") || "";
  } catch {
    link = "";
  }
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ничего */
    }
  };
  return (
    <>
      <SectionHeader
        title="Каналы"
        subtitle="Мессенджеры, через которые бот общается с клиентами"
      />
      <div className="mt-6 max-w-xl app-card p-5">
        <h3 className="font-bold">Ваша ссылка для клиентов</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Отправьте эту ссылку клиентам — все их сообщения попадут именно в ваш кабинет, а бот будет
          отвечать по вашему каталогу.
        </p>
        {link ? (
          <div className="mt-4 flex items-center gap-2">
            <input
              readOnly
              value={link}
              className={cn(fieldClass, "flex-1")}
              onFocus={(e) => e.target.select()}
            />
            <Button type="button" className="rounded-xl" onClick={copyLink}>
              {copied ? "Скопировано" : "Копировать"}
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Ссылка появится после входа в аккаунт.
          </p>
        )}
      </div>
      <div className="mt-4 max-w-xl space-y-3">
        <ChannelRow icon={Send} title="Telegram" detail="Подключён — бот отвечает автоматически" />
        <ChannelRow icon={MessageCircle} title="WhatsApp" detail="Скоро" />
        <ChannelRow icon={Instagram} title="Instagram" detail="Скоро" />
      </div>

      <div className="mt-4 max-w-xl app-card p-5">
        <h3 className="font-bold">Уведомления о новых чеках</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Напишите этому же боту в Telegram команду, чтобы получать уведомление каждый раз, когда
          клиент пришлёт чек на оплату:
        </p>
        <div className="mt-3 rounded-xl bg-secondary p-3 font-mono text-sm">
          /owner {getCompanyId()}
        </div>
      </div>
    </>
  );
}

function getBusinessName(): string {
  try {
    return localStorage.getItem("business_name") || "";
  } catch {
    return "";
  }
}

function apiUrl(path: string) {
  const API_URL = import.meta.env["VITE_API_URL"] || "http://localhost:5000";
  return `${API_URL}${path}`;
}

// ---------- Каталог (товары/услуги: цена + остаток) ----------

type ServiceItem = { _id: string; name: string; price: string; stock?: string };

async function fetchServices(): Promise<ServiceItem[]> {
  const response = await fetch(apiUrl("/api/services"), { credentials: "include" });
  if (!response.ok) throw new Error("Не удалось загрузить каталог");
  return response.json();
}

async function createServiceItem(payload: { name: string; price: string; stock: string }) {
  const response = await fetch(apiUrl("/api/services"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Не удалось добавить");
  return response.json();
}

async function updateServiceItem(
  id: string,
  payload: Partial<{ name: string; price: string; stock: string }>,
) {
  const response = await fetch(apiUrl(`/api/services/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Не удалось обновить");
  return response.json();
}

async function deleteServiceItem(id: string) {
  const response = await fetch(apiUrl(`/api/services/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Не удалось удалить");
  return response.json();
}

function CatalogRow({ item }: { item: ServiceItem }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price);
  const [stock, setStock] = useState(item.stock ?? "");

  const saveMutation = useMutation({
    mutationFn: () => updateServiceItem(item._id, { name, price, stock }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["services"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteServiceItem(item._id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["services"] }),
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_120px_100px_auto] items-center gap-2 border-b border-border p-3">
      <input
        className={fieldClass}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => saveMutation.mutate()}
      />
      <input
        className={fieldClass}
        value={price}
        placeholder="Цена"
        onChange={(e) => setPrice(e.target.value)}
        onBlur={() => saveMutation.mutate()}
      />
      <input
        className={fieldClass}
        value={stock}
        placeholder="Остаток"
        onChange={(e) => setStock(e.target.value)}
        onBlur={() => saveMutation.mutate()}
      />
      <button
        onClick={() => deleteMutation.mutate()}
        className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function CatalogPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({ queryKey: ["services"], queryFn: fetchServices });
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const createMutation = useMutation({
    mutationFn: createServiceItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      setName("");
      setPrice("");
      setStock("");
    },
  });

  const onCsvChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(apiUrl("/api/products/upload-csv"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setImportMsg(data.error || "Не удалось импортировать файл");
      } else {
        setImportMsg(data.message);
        queryClient.invalidateQueries({ queryKey: ["services"] });
      }
    } catch {
      setImportMsg("Ошибка соединения с сервером");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <>
      <SectionHeader
        title="Каталог"
        subtitle="Товары/услуги, цены и остатки — бот отвечает клиентам именно этими данными"
        action={
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary">
            <RefreshCw className="size-4" />
            {importing ? "Импортирую…" : "Импорт из CSV"}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={onCsvChange}
              disabled={importing}
            />
          </label>
        }
      />
      {importMsg && <p className="mt-2 text-sm text-muted-foreground">{importMsg}</p>}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="app-card overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_120px_100px_auto] gap-2 border-b border-border bg-secondary/40 p-3 text-xs font-semibold text-muted-foreground">
            <span>Название</span>
            <span>Цена</span>
            <span>Остаток</span>
            <span />
          </div>
          {isPending ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Загрузка…</div>
          ) : isError || !data ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Не удалось загрузить каталог
            </div>
          ) : data.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Пока пусто — добавь первую позицию справа или импортируй CSV
            </div>
          ) : (
            <div>
              {data.map((item) => (
                <CatalogRow key={item._id} item={item} />
              ))}
            </div>
          )}
        </div>
        <div className="app-card h-fit p-5">
          <h3 className="font-bold">Новая позиция</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Изменения в таблице слева сохраняются сами при клике вне поля.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name && price) createMutation.mutate({ name, price, stock });
            }}
          >
            <input
              className={fieldClass}
              placeholder="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={fieldClass}
              placeholder="Цена"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <input
              className={fieldClass}
              placeholder="Остаток (необязательно)"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
            <Button type="submit" className="w-full rounded-xl" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Добавляю…" : "Добавить"}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            CSV должен содержать столбцы: name, price, stock (необязательно).
          </p>
        </div>
      </div>
    </>
  );
}

// ---------- База знаний ----------

type KnowledgeItem = { _id: string; question: string; answer: string };

async function fetchKnowledgeBase(): Promise<KnowledgeItem[]> {
  const response = await fetch(apiUrl("/api/knowledge-base"), { credentials: "include" });
  if (!response.ok) throw new Error("Не удалось загрузить базу знаний");
  return response.json();
}

async function createKnowledgeItem(payload: { question: string; answer: string }) {
  const response = await fetch(apiUrl("/api/knowledge-base"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Не удалось добавить запись");
  return response.json();
}

async function deleteKnowledgeItem(id: string) {
  const response = await fetch(apiUrl(`/api/knowledge-base/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Не удалось удалить запись");
  return response.json();
}

function KnowledgePage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["knowledge-base"],
    queryFn: fetchKnowledgeBase,
  });
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const createMutation = useMutation({
    mutationFn: createKnowledgeItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      setQuestion("");
      setAnswer("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKnowledgeItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge-base"] }),
  });

  return (
    <>
      <SectionHeader
        title="База знаний"
        subtitle="Готовые ответы, которые бот использует для частых вопросов"
      />
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="app-card overflow-hidden">
          {isPending ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Загрузка…</div>
          ) : isError || !data ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Не удалось загрузить базу знаний
            </div>
          ) : data.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Пока пусто — добавь первый вопрос справа
            </div>
          ) : (
            <div>
              {data.map((item) => (
                <div
                  key={item._id}
                  className="flex items-start justify-between gap-3 border-b border-border p-4"
                >
                  <div>
                    <p className="font-bold">{item.question}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.answer}</p>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(item._id)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="app-card h-fit p-5">
          <h3 className="font-bold">Новый вопрос</h3>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (question && answer) createMutation.mutate({ question, answer });
            }}
          >
            <input
              className={fieldClass}
              placeholder="Вопрос, например «Наши цены»"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <textarea
              className={areaClass}
              placeholder="Ответ"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <Button type="submit" className="w-full rounded-xl" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Добавляю…" : "Добавить"}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}

// ---------- Оплаты (подтверждение чеков) ----------

type PendingPayment = {
  _id: string;
  contact: string;
  telegram_id: number;
  status: string;
  item_name?: string | null;
  quantity?: number;
  created_at: string;
};

async function fetchPendingPayments(): Promise<PendingPayment[]> {
  const response = await fetch(apiUrl("/api/payments/pending"), { credentials: "include" });
  if (!response.ok) throw new Error("Не удалось загрузить чеки");
  return response.json();
}

async function verifyPayment(id: string, status: "approved" | "rejected") {
  const response = await fetch(apiUrl(`/api/payments/${id}/verify`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error("Не удалось обновить статус");
  return response.json();
}

function PaymentPhoto({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const togglePhoto = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (photoUrl) return; // уже загружено раньше
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl(`/api/payments/${paymentId}/photo`), {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Не удалось загрузить фото");
      const blob = await response.blob();
      setPhotoUrl(URL.createObjectURL(blob));
    } catch {
      setError("Не удалось загрузить фото чека");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button variant="outline" className="rounded-xl" onClick={togglePhoto}>
        {open ? "Скрыть чек" : "Показать чек"}
      </Button>
      {open && (
        <div className="mt-3">
          {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {photoUrl && (
            <img
              src={photoUrl}
              alt="Чек об оплате"
              className="max-h-80 rounded-xl border border-border object-contain"
            />
          )}
        </div>
      )}
    </div>
  );
}

function PaymentsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["payments"],
    queryFn: fetchPendingPayments,
    refetchInterval: 8000,
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      verifyPayment(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payments"] }),
  });

  return (
    <>
      <SectionHeader
        title="Оплаты"
        subtitle="Клиенты прислали чек в Telegram — посмотрите фото и подтвердите или отклоните заказ"
      />
      <div className="mt-6 app-card overflow-hidden">
        {isPending ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Загрузка…</div>
        ) : isError || !data ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Не удалось загрузить чеки
          </div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Пока нет чеков, ожидающих подтверждения
          </div>
        ) : (
          <div>
            {data.map((p) => (
              <div key={p._id} className="flex flex-col gap-3 border-b border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">
                      {p.contact}
                      {p.item_name && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          · {p.item_name}
                          {p.quantity && p.quantity > 1 ? ` x${p.quantity}` : ""}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Прислал чек {formatTime(p.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="rounded-xl"
                      disabled={verifyMutation.isPending}
                      onClick={() => verifyMutation.mutate({ id: p._id, status: "approved" })}
                    >
                      <CheckCircle2 className="size-4" />
                      Подтвердить
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={verifyMutation.isPending}
                      onClick={() => verifyMutation.mutate({ id: p._id, status: "rejected" })}
                    >
                      <XCircle className="size-4" />
                      Отклонить
                    </Button>
                  </div>
                </div>
                <PaymentPhoto paymentId={p._id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/api/settings/payment"), { credentials: "include" });
      if (!response.ok) throw new Error("Не удалось загрузить реквизиты");
      return response.json() as Promise<{ payment_info: string; payment_qr: string }>;
    },
  });

  const [paymentInfo, setPaymentInfo] = useState("");
  const [paymentQr, setPaymentQr] = useState("");
  const [loaded, setLoaded] = useState(false);

  if (data && !loaded) {
    setPaymentInfo(data.payment_info ?? "");
    setPaymentQr(data.payment_qr ?? "");
    setLoaded(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(apiUrl("/api/settings/payment"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ payment_info: paymentInfo, payment_qr: paymentQr }),
      });
      if (!response.ok) throw new Error("Не удалось сохранить");
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payment-settings"] }),
  });

  const onQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPaymentQr(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <>
      <SectionHeader
        title="Настройки"
        subtitle="Реквизиты для оплаты — бот присылает клиенту именно их, а не придумывает сам"
      />
      <div className="mt-6 max-w-xl app-card p-5">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Текст с реквизитами</label>
              <textarea
                className={areaClass}
                rows={4}
                placeholder="Например: Kaspi Gold 4400 4302 XXXX XXXX, Айгерим А."
                value={paymentInfo}
                onChange={(e) => setPaymentInfo(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">
                QR-код для оплаты (необязательно)
              </label>
              <input type="file" accept="image/*" onChange={onQrFileChange} className="text-sm" />
              {paymentQr && (
                <img
                  src={paymentQr}
                  alt="QR для оплаты"
                  className="mt-3 h-32 w-32 rounded-xl border border-border object-contain"
                />
              )}
            </div>
            <Button
              className="rounded-xl"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Сохраняю…" : "Сохранить"}
            </Button>
            {saveMutation.isSuccess && (
              <p className="text-xs text-success">
                Сохранено — бот теперь будет присылать именно это.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export function ZhauapApp() {
  const [view, setView] = useState<View>("landing");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  if (view === "landing") return <Landing go={setView} />;
  if (view === "auth") return <AuthPage go={setView} />;
  if (view === "onboarding") return <Onboarding go={setView} />;

  return (
    <AppShell view={view} go={setView}>
      {view === "inbox" ? (
        <InboxPage
          go={setView}
          onOpenLead={(lead) => {
            setSelectedLead(lead);
            setView("conversation");
          }}
        />
      ) : view === "conversation" ? (
        <Conversation go={setView} lead={selectedLead} />
      ) : view === "channels" ? (
        <ChannelsPage />
      ) : view === "catalog" ? (
        <CatalogPage />
      ) : view === "knowledge" ? (
        <KnowledgePage />
      ) : view === "payments" ? (
        <PaymentsPage />
      ) : view === "billing" ? (
        <BillingPage />
      ) : view === "results" ? (
        <ResultsPage />
      ) : view === "settings" ? (
        <SettingsPage />
      ) : (
        <div className="app-card p-8 text-center">
          <h2 className="text-xl font-bold">Раздел в разработке</h2>
          <Button className="mt-4 rounded-xl" onClick={() => setView("inbox")}>
            Вернуться во входящие
          </Button>
        </div>
      )}
    </AppShell>
  );
}
