import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { passwordAcceptable } from "@/lib/chat-utils";
import {
  changePassword,
  fetchBusiness,
  fetchPaymentSettings,
  qk,
  saveBusiness,
  savePaymentSettings,
} from "@/lib/queries";
import type { BusinessProfile } from "@/lib/types";
import { DataState, ErrorNote, Field, SectionHeader, SuccessNote, areaClass } from "./common";

const QR_MAX_BYTES = 2 * 1024 * 1024;

const PROFILE_FIELDS: {
  key: keyof BusinessProfile;
  label: string;
  placeholder: string;
  multiline?: boolean;
}[] = [
  { key: "business_name", label: "Название бизнеса", placeholder: "Кондитерская «Медовик»" },
  {
    key: "business_type",
    label: "Тип бизнеса",
    placeholder: "Кондитерская, салон красоты, репетитор…",
  },
  {
    key: "about",
    label: "О бизнесе",
    placeholder: "Чем вы занимаетесь, что важно знать клиенту",
    multiline: true,
  },
  {
    key: "hours",
    label: "График работы",
    placeholder: "Пн–Пт 09:00–19:00, Сб 10:00–16:00",
    multiline: true,
  },
  { key: "address", label: "Адрес", placeholder: "Астана, ул. Абая 10" },
  { key: "phone", label: "Телефон", placeholder: "+7 700 000 00 00" },
  {
    key: "delivery",
    label: "Доставка",
    placeholder: "По городу 1 000 ₸, бесплатно от 15 000 ₸",
    multiline: true,
  },
  {
    key: "conditions",
    label: "Условия",
    placeholder: "Предоплата 50%, отмена за 24 часа, возврат…",
    multiline: true,
  },
  { key: "tone", label: "Стиль ответов", placeholder: "Тёплый и заботливый / Деловой и краткий" },
];

function BusinessForm() {
  const queryClient = useQueryClient();
  const business = useQuery({ queryKey: qk.business, queryFn: fetchBusiness });
  const [form, setForm] = useState<Partial<BusinessProfile>>({});
  useEffect(() => {
    if (business.data) setForm(business.data);
  }, [business.data]);

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<BusinessProfile> = {};
      for (const f of PROFILE_FIELDS) payload[f.key] = (form[f.key] ?? "") as never;
      return saveBusiness(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.business });
      void queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });

  if (business.isPending) return <DataState state="loading" />;
  if (business.isError)
    return <DataState state="error" error={business.error} retry={() => void business.refetch()} />;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Бот отвечает клиентам только этими данными, каталогом и базой знаний. Чего здесь нет — бот
        не придумает, а передаст вопрос вам.
      </p>
      {PROFILE_FIELDS.map((f) =>
        f.multiline ? (
          <label key={f.key} className="block">
            <span className="mb-2 block text-sm font-semibold">{f.label}</span>
            <textarea
              className={areaClass}
              rows={2}
              placeholder={f.placeholder}
              value={String(form[f.key] ?? "")}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          </label>
        ) : (
          <Field
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            value={String(form[f.key] ?? "")}
            onChange={(v) => setForm({ ...form, [f.key]: v })}
          />
        ),
      )}
      <Button type="submit" className="rounded-xl" disabled={save.isPending}>
        {save.isPending ? "Сохраняю…" : "Сохранить профиль"}
      </Button>
      {save.isSuccess && (
        <SuccessNote>Профиль сохранён — бот уже использует новые данные.</SuccessNote>
      )}
      <ErrorNote error={save.error} />
    </form>
  );
}

function PaymentForm() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: qk.paymentSettings, queryFn: fetchPaymentSettings });
  const [info, setInfo] = useState("");
  const [qr, setQr] = useState("");
  const [fileError, setFileError] = useState("");
  useEffect(() => {
    if (settings.data) {
      setInfo(settings.data.payment_info ?? "");
      setQr(settings.data.payment_qr ?? "");
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => savePaymentSettings({ payment_info: info, payment_qr: qr }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.paymentSettings }),
  });

  const onQrFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setFileError("Нужна картинка PNG, JPEG или WEBP");
      return;
    }
    if (file.size > QR_MAX_BYTES) {
      setFileError("Картинка больше 2 МБ — уменьшите её");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setQr(reader.result as string);
    reader.readAsDataURL(file);
  };

  if (settings.isPending) return <DataState state="loading" />;
  if (settings.isError)
    return <DataState state="error" error={settings.error} retry={() => void settings.refetch()} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Когда клиент подтверждает покупку, бот присылает именно эти реквизиты — сам он их никогда не
        придумывает.
      </p>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Текст с реквизитами</span>
        <textarea
          className={areaClass}
          rows={4}
          maxLength={2000}
          placeholder="Например: Kaspi Gold 4400 4302 XXXX XXXX, Айгерим А."
          value={info}
          onChange={(e) => setInfo(e.target.value)}
        />
      </label>
      <div>
        <span className="mb-2 block text-sm font-semibold">QR-код для оплаты (необязательно)</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onQrFileChange}
          className="text-sm"
        />
        {fileError && <p className="mt-2 text-sm text-destructive">{fileError}</p>}
        {qr && (
          <div className="mt-3 flex items-end gap-3">
            <img
              src={qr}
              alt="QR для оплаты"
              className="h-32 w-32 rounded-xl border border-border object-contain"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl"
              onClick={() => setQr("")}
            >
              Убрать QR
            </Button>
          </div>
        )}
      </div>
      <Button className="rounded-xl" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Сохраняю…" : "Сохранить реквизиты"}
      </Button>
      {save.isSuccess && <SuccessNote>Сохранено — бот будет присылать именно это.</SuccessNote>}
      <ErrorNote error={save.error} />
    </div>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<Error | null>(null);
  const mutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!passwordAcceptable(next))
      return setLocalError(new Error("Новый пароль: минимум 8 символов, буква и цифра."));
    if (next !== confirm) return setLocalError(new Error("Пароли не совпадают."));
    mutation.mutate();
  };
  return (
    <form className="space-y-4" onSubmit={submit}>
      <Field
        label="Текущий пароль"
        type="password"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        required
      />
      <Field
        label="Новый пароль"
        type="password"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        required
        hint="Минимум 8 символов, буква и цифра"
      />
      <Field
        label="Повторите новый пароль"
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        required
      />
      <Button type="submit" className="rounded-xl" disabled={mutation.isPending}>
        {mutation.isPending ? "Сохраняю…" : "Сменить пароль"}
      </Button>
      {mutation.isSuccess && <SuccessNote>{mutation.data.message}</SuccessNote>}
      <ErrorNote error={localError ?? mutation.error} />
    </form>
  );
}

export function SettingsPage() {
  return (
    <>
      <SectionHeader
        title="Настройки"
        subtitle="Профиль бизнеса, реквизиты оплаты и безопасность"
      />
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="app-card p-5">
          <h2 className="mb-4 text-lg font-bold">Профиль бизнеса</h2>
          <BusinessForm />
        </section>
        <div className="space-y-4">
          <section className="app-card p-5">
            <h2 className="mb-4 text-lg font-bold">Реквизиты для оплаты</h2>
            <PaymentForm />
          </section>
          <section className="app-card p-5">
            <h2 className="mb-4 text-lg font-bold">Смена пароля</h2>
            <PasswordForm />
          </section>
        </div>
      </div>
    </>
  );
}
