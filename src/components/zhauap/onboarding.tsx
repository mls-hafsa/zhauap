import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError, errorMessage } from "@/lib/api";
import { createService, fetchMe, qk, saveBusiness } from "@/lib/queries";
import { ErrorNote, Logo, fieldClass } from "./common";

const STEPS = ["Ваш бизнес", "График работы", "Услуги и цены", "Стиль ответов", "Подключение"];
const BUSINESS_TYPES = [
  "Бьюти-мастер",
  "Студия красоты",
  "Кондитерская / еда",
  "Магазин",
  "Репетитор",
  "Другое",
];
const TONES = ["Тёплый и заботливый", "Деловой и краткий", "Дружелюбный", "Свой вариант"];
const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

type Day = { open: boolean; from: string; to: string };
type ServiceDraft = { name: string; price: string; stock: string };

function ChoiceGrid({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((x) => (
        <button
          type="button"
          key={x}
          onClick={() => onChange(x)}
          aria-pressed={value === x}
          className={cn(
            "rounded-2xl border p-5 text-left text-sm font-bold transition",
            value === x
              ? "border-primary bg-success-soft text-primary active-glow"
              : "border-border bg-surface hover:border-muted-foreground",
          )}
        >
          {x}
          {value === x && <CheckCircle2 className="mt-5 size-5" />}
        </button>
      ))}
    </div>
  );
}

function hoursText(days: Day[]): string {
  return days.map((d, i) => `${DAYS[i]}: ${d.open ? `${d.from}–${d.to}` : "выходной"}`).join("; ");
}

export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: qk.me, queryFn: fetchMe, retry: false });
  const [step, setStep] = useState(0);
  const [businessType, setBusinessType] = useState(BUSINESS_TYPES[0]!);
  const [customType, setCustomType] = useState("");
  const [days, setDays] = useState<Day[]>(
    DAYS.map((_, i) => ({ open: i < 6, from: "09:00", to: i === 5 ? "15:00" : "19:00" })),
  );
  const [services, setServices] = useState<ServiceDraft[]>([{ name: "", price: "", stock: "" }]);
  const [tone, setTone] = useState(TONES[0]!);
  const [customTone, setCustomTone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  const unauthorized = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (unauthorized) void navigate({ to: "/login" });
  }, [unauthorized, navigate]);

  const updateService = (index: number, field: keyof ServiceDraft, value: string) =>
    setServices((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));

  const saveServices = async () => {
    const problems: string[] = [];
    const remaining: ServiceDraft[] = [];
    for (const s of services) {
      if (!s.name.trim() && !s.price.trim()) continue;
      try {
        await createService({ name: s.name.trim(), price: s.price.trim(), stock: s.stock.trim() });
      } catch (err) {
        // Уже есть в каталоге — это не ошибка онбординга.
        if (err instanceof ApiError && err.status === 409) continue;
        problems.push(`${s.name || "без названия"}: ${errorMessage(err)}`);
        remaining.push(s);
      }
    }
    setServices(remaining.length ? remaining : [{ name: "", price: "", stock: "" }]);
    void queryClient.invalidateQueries({ queryKey: qk.services });
    return problems;
  };

  const next = async () => {
    setError(null);
    setSaving(true);
    try {
      if (step === 0) {
        await saveBusiness({
          business_type: businessType === "Другое" ? customType.trim() || "Другое" : businessType,
        });
      } else if (step === 1) {
        await saveBusiness({ hours: hoursText(days) });
      } else if (step === 2) {
        const problems = await saveServices();
        setSkipped(problems);
        if (problems.length) return;
      } else if (step === 3) {
        await saveBusiness({ tone: tone === "Свой вариант" ? customTone.trim() || tone : tone });
      } else {
        await saveBusiness({ onboarding_completed: true });
        await queryClient.invalidateQueries({ queryKey: qk.me });
        await navigate({ to: "/app/inbox" });
        return;
      }
      setStep(step + 1);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <header className="mx-auto flex max-w-5xl items-center justify-between">
        <Logo />
        <Link to="/app/inbox" className="text-sm text-muted-foreground hover:text-foreground">
          Пропустить
        </Link>
      </header>
      <main className="mx-auto mt-12 max-w-3xl">
        <div className="mb-8 flex items-center gap-2">
          {STEPS.map((s, i) => (
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
          <h1 className="mt-2 text-2xl font-extrabold">{STEPS[step]}</h1>
          <div className="mt-7 min-h-72">
            {step === 0 && (
              <div className="space-y-3">
                <ChoiceGrid
                  items={BUSINESS_TYPES}
                  value={businessType}
                  onChange={setBusinessType}
                />
                {businessType === "Другое" && (
                  <input
                    className={fieldClass}
                    placeholder="Чем вы занимаетесь?"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                  />
                )}
              </div>
            )}
            {step === 1 && (
              <div className="space-y-3">
                {DAYS.map((d, i) => {
                  const day = days[i]!;
                  const setDay = (patch: Partial<Day>) =>
                    setDays(days.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div
                      key={d}
                      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-xl border border-border p-3 sm:gap-3"
                    >
                      <span className="text-sm font-semibold">{d}</span>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={day.open}
                          onChange={(e) => setDay({ open: e.target.checked })}
                        />
                        работаем
                      </label>
                      <input
                        type="time"
                        className="w-24 rounded-lg bg-secondary p-2 text-sm"
                        value={day.from}
                        disabled={!day.open}
                        onChange={(e) => setDay({ from: e.target.value })}
                        aria-label={`${d}: с`}
                      />
                      <input
                        type="time"
                        className="w-24 rounded-lg bg-secondary p-2 text-sm"
                        value={day.to}
                        disabled={!day.open}
                        onChange={(e) => setDay({ to: e.target.value })}
                        aria-label={`${d}: до`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Можно добавить несколько позиций сейчас, а остальное — позже в «Каталоге» или
                  через CSV. Остаток можно не указывать.
                </p>
                {services.map((s, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_100px_80px_auto] gap-2">
                    <input
                      className={fieldClass}
                      value={s.name}
                      placeholder="Название"
                      onChange={(e) => updateService(i, "name", e.target.value)}
                    />
                    <input
                      className={fieldClass}
                      value={s.price}
                      placeholder="Цена"
                      onChange={(e) => updateService(i, "price", e.target.value)}
                    />
                    <input
                      className={fieldClass}
                      value={s.stock}
                      placeholder="Остаток"
                      inputMode="numeric"
                      onChange={(e) => updateService(i, "stock", e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label="Убрать строку"
                      className="rounded-lg p-2 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setServices(
                          services.length > 1
                            ? services.filter((_, j) => j !== i)
                            : [{ name: "", price: "", stock: "" }],
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setServices([...services, { name: "", price: "", stock: "" }])}
                >
                  <Plus />
                  Добавить услугу
                </Button>
                {skipped.length > 0 && (
                  <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                    Не сохранены (исправьте и нажмите «Продолжить»):
                    <ul className="mt-1 list-disc pl-5">
                      {skipped.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {step === 3 && (
              <div className="space-y-3">
                <ChoiceGrid items={TONES} value={tone} onChange={setTone} />
                {tone === "Свой вариант" && (
                  <input
                    className={fieldClass}
                    placeholder="Опишите стиль, например «на “вы”, коротко, с эмодзи»"
                    value={customTone}
                    onChange={(e) => setCustomTone(e.target.value)}
                  />
                )}
              </div>
            )}
            {step === 4 && (
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  Отправьте клиентам эту ссылку — их сообщения придут вам во «Входящие»:
                </p>
                <div className="break-all rounded-xl bg-secondary p-3 font-mono">
                  {me.data?.telegram_link ?? "Загрузка…"}
                </div>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <Send className="mt-0.5 size-4 shrink-0 text-primary" />
                  Чтобы получать уведомления на телефон, привяжите свой Telegram в разделе «Каналы»
                  после завершения.
                </p>
              </div>
            )}
          </div>
          <ErrorNote error={error} className="mt-4" />
          <div className="mt-7 flex justify-between">
            <Button
              variant="ghost"
              className="rounded-xl"
              disabled={step === 0 || saving}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft />
              Назад
            </Button>
            <Button className="rounded-xl" disabled={saving} onClick={() => void next()}>
              {saving ? "Сохраняю…" : step < 4 ? "Продолжить" : "Открыть Zhauap"}
              <ArrowRight />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
