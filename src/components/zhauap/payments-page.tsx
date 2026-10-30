import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { API_URL, errorMessage } from "@/lib/api";
import { formatTime } from "@/lib/chat-utils";
import { fetchPayments, qk, verifyPayment } from "@/lib/queries";
import type { Payment } from "@/lib/types";
import { DataState, ErrorNote, SectionHeader, SuccessNote } from "./common";

const TABS = [
  { id: "pending", label: "На проверке" },
  { id: "approved", label: "Подтверждённые" },
  { id: "rejected", label: "Отклонённые" },
] as const;

function ReceiptFile({ payment }: { payment: Payment }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isPdf = payment.mime_type === "application/pdf";

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const load = async () => {
    if (url) return url;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/payments/${encodeURIComponent(payment._id)}/photo`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Не удалось загрузить чек");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      setUrl(objectUrl);
      return objectUrl;
    } catch (err) {
      setError(errorMessage(err, "Не удалось загрузить чек"));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    if (isPdf) {
      const objectUrl = await load();
      if (objectUrl) window.open(objectUrl, "_blank", "noopener");
      return;
    }
    if (!open) await load();
    setOpen(!open);
  };

  return (
    <div>
      <Button variant="outline" className="rounded-xl" onClick={toggle} disabled={loading}>
        {isPdf && <FileText />}
        {loading ? "Загрузка…" : isPdf ? "Открыть PDF-чек" : open ? "Скрыть чек" : "Показать чек"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {open && url && !isPdf && (
        <img
          src={url}
          alt="Чек об оплате"
          className="mt-3 max-h-96 rounded-xl border border-border object-contain"
        />
      )}
    </div>
  );
}

export function PaymentsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pending");
  const [warning, setWarning] = useState("");
  const payments = useQuery({
    queryKey: qk.payments(tab),
    queryFn: () => fetchPayments(tab),
    refetchInterval: tab === "pending" ? 10_000 : false,
  });

  const verify = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      verifyPayment(id, status),
    onSuccess: (data) => {
      setWarning(data.warning ?? "");
      void queryClient.invalidateQueries({ queryKey: qk.paymentsAll });
      void queryClient.invalidateQueries({ queryKey: qk.services });
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
      void queryClient.invalidateQueries({ queryKey: qk.conversationsAll });
    },
  });

  return (
    <>
      <SectionHeader
        title="Оплаты"
        subtitle="Клиенты прислали чек в Telegram — посмотрите его и подтвердите или отклоните заказ"
      />
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 rounded-xl px-3 py-2 text-sm font-semibold",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {warning && <SuccessNote className="bg-warning-soft text-warning">{warning}</SuccessNote>}
        <ErrorNote error={verify.error} />
      </div>
      <div className="mt-3 app-card overflow-hidden">
        {payments.isPending ? (
          <DataState state="loading" />
        ) : payments.isError ? (
          <DataState state="error" error={payments.error} retry={() => void payments.refetch()} />
        ) : payments.data.length === 0 ? (
          <DataState
            state="empty"
            emptyTitle={tab === "pending" ? "Нет чеков на проверке" : "Здесь пока пусто"}
            emptyText="Когда клиент пришлёт фото или PDF чека в Telegram, он появится здесь."
          />
        ) : (
          payments.data.map((p) => (
            <div key={p._id} className="flex flex-col gap-3 border-b border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">
                    {p.name || p.contact}
                    {p.key && (
                      <Link
                        to="/app/inbox/$key"
                        params={{ key: p.key }}
                        className="ml-2 text-xs font-semibold text-primary"
                      >
                        открыть диалог
                      </Link>
                    )}
                  </p>
                  {p.items.length > 0 ? (
                    <ul className="mt-1 text-sm text-muted-foreground">
                      {p.items.map((it) => (
                        <li key={it.name}>
                          {it.name} × {it.quantity}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Товары не определены — уточните в диалоге
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Прислал чек {formatTime(p.created_at)}
                  </p>
                </div>
                {p.status === "pending" ? (
                  <div className="flex gap-2">
                    <Button
                      className="rounded-xl"
                      disabled={verify.isPending}
                      onClick={() => verify.mutate({ id: p._id, status: "approved" })}
                    >
                      <CheckCircle2 className="size-4" />
                      Подтвердить
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={verify.isPending}
                      onClick={() => {
                        if (confirm("Отклонить чек? Клиент получит сообщение об этом."))
                          verify.mutate({ id: p._id, status: "rejected" });
                      }}
                    >
                      <XCircle className="size-4" />
                      Отклонить
                    </Button>
                  </div>
                ) : (
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      p.status === "approved" ? "text-success" : "text-destructive",
                    )}
                  >
                    {p.status === "approved" ? "Подтверждён" : "Отклонён"}
                  </span>
                )}
              </div>
              <ReceiptFile payment={p} />
            </div>
          ))
        )}
      </div>
    </>
  );
}
