import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { channelIcon, channelOf, formatTime } from "@/lib/leads";
import { resumeText } from "@/lib/chat-utils";
import { archiveConversation, fetchConversations, qk } from "@/lib/queries";
import type { StatusKind } from "@/lib/types";
import { DataState, ErrorNote, SectionHeader, StatusBadge, fieldClass } from "./common";

const PAGE = 50;
const STATUS_TABS: { id: "all" | StatusKind; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "need", label: "Нужен владелец" },
  { id: "owner", label: "Владелец ведёт" },
  { id: "bot", label: "Бот ответил" },
  { id: "wait", label: "Чек на проверке" },
];

function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function InboxPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"all" | StatusKind>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(search.trim());

  useEffect(() => setLimit(PAGE), [status, q]);

  const params = { q, status, limit };
  const list = useQuery({
    queryKey: qk.conversations(params),
    queryFn: () => fetchConversations(params),
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  });

  const archive = useMutation({
    mutationFn: archiveConversation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.conversationsAll });
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
    },
  });

  const data = list.data;
  const counts = data?.counts;
  const items = data?.items ?? [];

  return (
    <>
      <SectionHeader
        title="Входящие"
        subtitle="Один диалог на клиента, новые сверху. Обновляется автоматически."
        action={
          <Button
            className="rounded-xl"
            variant="outline"
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
          >
            <RefreshCw className={cn(list.isFetching && "animate-spin")} />
            Обновить
          </Button>
        }
      />
      <div className="mt-6 app-card overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatus(tab.id)}
                className={cn(
                  "shrink-0 rounded-xl px-3 py-2 text-sm font-semibold",
                  status === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {tab.label} <span className="ml-1 opacity-70">{counts?.[tab.id] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(fieldClass, "pl-9")}
              placeholder="Найти по имени, нику или тексту сообщения"
              aria-label="Поиск по диалогам"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Сейчас подключён Telegram. WhatsApp и Instagram появятся позже.
          </p>
        </div>
        <ErrorNote error={archive.error} className="m-4" />
        {list.isPending ? (
          <DataState state="loading" />
        ) : list.isError && !data ? (
          <DataState state="error" error={list.error} retry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <DataState
            state="empty"
            emptyTitle={q || status !== "all" ? "Ничего не найдено" : "Здесь пока тихо"}
            emptyText={
              q || status !== "all"
                ? "Попробуйте изменить фильтр или запрос."
                : "Отправьте клиентам ссылку из раздела «Каналы» — их сообщения появятся здесь."
            }
          />
        ) : (
          <div>
            {items.map((c) => {
              const channel = channelOf(c.channel, c.contact);
              const Icon = channelIcon(channel);
              const name = c.name || c.display_contact;
              return (
                <div
                  key={c.key}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border transition hover:bg-secondary/40",
                    c.status === "need" && "bg-warning-soft/40",
                  )}
                >
                  <Link
                    to="/app/inbox/$key"
                    params={{ key: c.key }}
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4"
                  >
                    <div className="relative grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-bold">
                      {name.charAt(0).toUpperCase()}
                      <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-card bg-surface-raised">
                        <Icon className="size-3 text-primary" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-bold">{name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {c.display_contact}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {c.last_message || "—"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge kind={c.status} />
                        {c.status === "need" && c.minutes_left !== null && (
                          <span className="text-xs text-warning">
                            AI ответит {resumeText(c.minutes_left)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{formatTime(c.last_at)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {c.message_count} сообщ.
                      </p>
                    </div>
                  </Link>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Перенести диалог с «${name}» в архив? История сохранится, а новое сообщение клиента вернёт диалог во «Входящие».`,
                        )
                      )
                        archive.mutate(c.key);
                    }}
                    disabled={archive.isPending}
                    title="В архив"
                    aria-label={`Архивировать диалог с ${name}`}
                    className="mr-3 shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Archive className="size-4" />
                  </button>
                </div>
              );
            })}
            {data?.has_more && (
              <div className="p-4 text-center">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setLimit(limit + PAGE)}
                  disabled={list.isFetching}
                >
                  Показать ещё
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
