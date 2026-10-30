import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Check, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { passwordAcceptable, passwordChecks } from "@/lib/chat-utils";
import { login, qk, registerAccount, requestPasswordReset, resetPassword } from "@/lib/queries";
import { ErrorNote, Field, Logo, Pill, SuccessNote } from "./common";

export type AuthMode = "login" | "register" | "forgot" | "reset" | "success";

const TITLES: Record<AuthMode, string> = {
  login: "С возвращением",
  register: "Создайте аккаунт",
  forgot: "Восстановить пароль",
  reset: "Новый пароль",
  success: "Пароль обновлён",
};

export function AuthPage({ initialMode }: { initialMode: AuthMode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const checks = passwordChecks(password);
  const strength = (checks.filter((c) => c.ok).length / checks.length) * 100;
  const needsNewPassword = mode === "register" || mode === "reset";

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setInfo("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsNewPassword) {
      if (!passwordAcceptable(password)) {
        setError(new Error("Пароль не соответствует требованиям ниже."));
        return;
      }
      if (password !== confirm) {
        setError(new Error("Пароли не совпадают."));
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "register") {
        const account = await registerAccount(email, password, businessName);
        queryClient.setQueryData(qk.me, account);
        await navigate({ to: "/onboarding" });
      } else if (mode === "login") {
        const account = await login(email, password);
        queryClient.setQueryData(qk.me, account);
        await navigate({ to: account.onboarding_completed ? "/app/inbox" : "/onboarding" });
      } else if (mode === "forgot") {
        const result = await requestPasswordReset(email);
        setInfo(result.message);
        setMode("reset");
      } else if (mode === "reset") {
        await resetPassword(email, code, password);
        setPassword("");
        setConfirm("");
        switchMode("success");
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const submitLabel =
    mode === "login"
      ? "Войти"
      : mode === "register"
        ? "Создать аккаунт"
        : mode === "forgot"
          ? "Получить код"
          : "Сохранить пароль";

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
        <Pill>14 дней бесплатно</Pill>
      </div>
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="mb-8 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            На главную
          </Link>
          <div className="app-card p-5 sm:p-8">
            <div className="mb-7 lg:hidden">
              <Logo />
            </div>
            <h2 className="text-2xl font-extrabold">{TITLES[mode]}</h2>
            <ErrorNote error={error} className="mt-3" />

            {mode === "success" ? (
              <div className="py-8 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft text-success">
                  <CheckCircle2 />
                </div>
                <p className="mt-5 text-sm leading-6 text-muted-foreground">
                  Теперь можно войти с новым паролем. На других устройствах сессии завершены.
                </p>
                <Button className="mt-6 w-full rounded-xl" onClick={() => switchMode("login")}>
                  Войти
                </Button>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                {mode === "forgot" && (
                  <p className="text-sm leading-6 text-muted-foreground">
                    Код для сброса придёт в Telegram-бот Zhauap — если вы привязали свой Telegram в
                    разделе «Каналы». Если Telegram не привязан, восстановить доступ можно только
                    через поддержку.
                  </p>
                )}
                {mode === "reset" && info && <SuccessNote>{info}</SuccessNote>}
                {mode === "register" && (
                  <Field
                    label="Название бизнеса"
                    placeholder="Например, Кондитерская «Медовик»"
                    value={businessName}
                    onChange={setBusinessName}
                  />
                )}
                <Field
                  label="Email"
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  autoComplete="email"
                  required
                />
                {mode === "reset" && (
                  <Field
                    label="Код из Telegram"
                    placeholder="6 цифр"
                    value={code}
                    onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                    autoComplete="one-time-code"
                    required
                  />
                )}
                {mode !== "forgot" && (
                  <>
                    <Field
                      label={mode === "reset" ? "Новый пароль" : "Пароль"}
                      placeholder="Введите пароль"
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={setPassword}
                      autoComplete={needsNewPassword ? "new-password" : "current-password"}
                      required
                      right={
                        <button
                          type="button"
                          onClick={() => setShow(!show)}
                          className="text-xs text-muted-foreground"
                        >
                          {show ? "Скрыть" : "Показать"}
                        </button>
                      }
                    />
                    {needsNewPassword && (
                      <>
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${strength}%` }}
                          />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {checks.map((c) => (
                            <span
                              key={c.label}
                              className={cn(
                                "flex items-center gap-2 text-xs",
                                c.ok ? "text-success" : "text-muted-foreground",
                              )}
                            >
                              <Check className="size-3" />
                              {c.label}
                            </span>
                          ))}
                        </div>
                        <Field
                          label="Повторите пароль"
                          placeholder="Ещё раз"
                          type={show ? "text" : "password"}
                          value={confirm}
                          onChange={setConfirm}
                          autoComplete="new-password"
                          required
                        />
                      </>
                    )}
                  </>
                )}
                <Button className="h-11 w-full rounded-xl" type="submit" disabled={busy}>
                  {mode === "forgot" && <Send />}
                  {busy ? "Подождите…" : submitLabel}
                </Button>
              </form>
            )}

            {mode === "login" && (
              <>
                <button className="mt-4 text-sm text-primary" onClick={() => switchMode("forgot")}>
                  Забыл пароль
                </button>
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Нет аккаунта?{" "}
                  <button className="font-bold text-primary" onClick={() => switchMode("register")}>
                    Зарегистрироваться
                  </button>
                </p>
              </>
            )}
            {(mode === "register" || mode === "forgot" || mode === "reset") && (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "register" ? "Уже есть аккаунт? " : "Вспомнили пароль? "}
                <button className="font-bold text-primary" onClick={() => switchMode("login")}>
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
