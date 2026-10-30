import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Inbox,
  RefreshCw,
  User,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/api";
import type { ImportReport } from "@/lib/types";

export type IconType = typeof Inbox;

export const fieldClass =
  "h-11 w-full rounded-xl border border-input bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-muted-foreground disabled:opacity-60";
export const areaClass =
  "w-full rounded-xl border border-input bg-surface p-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-muted-foreground disabled:opacity-60";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Zap className="size-5" fill="currentColor" />
      </div>
      {!compact && <span className="text-xl font-extrabold">Zhauap</span>}
    </div>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-success-soft px-2.5 py-1 text-xs font-bold text-primary">
      {children}
    </span>
  );
}

const STATUS_MAP: Record<string, { label: string; cls: string; icon: IconType }> = {
  bot: { label: "Бот ответил", cls: "bg-success-soft text-success", icon: CheckCircle2 },
  need: { label: "Нужен владелец", cls: "bg-warning-soft text-warning", icon: Bell },
  owner: { label: "Владелец ведёт", cls: "bg-info-soft text-info", icon: User },
  wait: { label: "Чек на проверке", cls: "bg-muted text-muted-foreground", icon: Clock3 },
};

export function StatusBadge({ kind }: { kind: string }) {
  const item = STATUS_MAP[kind] ?? STATUS_MAP["wait"]!;
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

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function DataState({
  state,
  retry,
  error,
  emptyTitle = "Здесь пока тихо",
  emptyText = "Новые сообщения появятся в этом списке.",
}: {
  state: "loading" | "empty" | "error";
  retry?: () => void;
  error?: unknown;
  emptyTitle?: string;
  emptyText?: string;
}) {
  if (state === "loading")
    return (
      <div className="space-y-4 p-5" aria-busy="true">
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
    <div className="p-10 text-center sm:p-14">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
        {empty ? <Inbox /> : <AlertTriangle />}
      </div>
      <h3 className="mt-4 font-bold">{empty ? emptyTitle : "Не удалось загрузить данные"}</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {empty ? emptyText : errorMessage(error, "Проверьте соединение и попробуйте ещё раз.")}
      </p>
      {!empty && retry && (
        <Button variant="outline" className="mt-5 rounded-xl" onClick={retry}>
          <RefreshCw />
          Повторить
        </Button>
      )}
    </div>
  );
}

export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className={cn("rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive", className)}
    >
      {errorMessage(error)}
    </p>
  );
}

export function SuccessNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="status"
      className={cn("rounded-xl bg-success-soft px-3 py-2 text-sm text-success", className)}
    >
      {children}
    </p>
  );
}

export function Field({
  label,
  placeholder,
  type = "text",
  value,
  right,
  onChange,
  autoComplete,
  required,
  hint,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value: string;
  right?: ReactNode;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <span className="relative block">
        <input
          className={cn(fieldClass, right && "pr-20")}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        />
        {right && <span className="absolute right-3 top-1/2 -translate-y-1/2">{right}</span>}
      </span>
      {hint && <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function ChannelRow({
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
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function ImportReportView({ report }: { report: ImportReport }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-sm">
      <p>
        Добавлено <b>{report.created}</b>, обновлено <b>{report.updated}</b>, пропущено{" "}
        <b>{report.skipped}</b>
        <span className="text-muted-foreground">
          {" "}
          · разделитель «{report.delimiter === "\t" ? "TAB" : report.delimiter}»
        </span>
      </p>
      {report.errors.length > 0 && (
        <>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-primary"
            onClick={() => setOpen(!open)}
          >
            {open ? "Скрыть пропущенные строки" : "Почему строки пропущены?"}
          </button>
          {open && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {report.errors.map((e) => (
                <li key={`${e.row}-${e.reason}`}>
                  Строка {e.row}: {e.reason}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
