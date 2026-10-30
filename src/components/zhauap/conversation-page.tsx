import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Bot, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { channelOf, formatTime } from "@/lib/leads";
import { initials, mergeMessages, replyLabel, replySide, resumeText } from "@/lib/chat-utils";
import {
  fetchConversation,
  fetchMessages,
  qk,
  sendOwnerReply,
  setConversationMode,
} from "@/lib/queries";
import type { ConversationDetail, Message } from "@/lib/types";
import { DataState, ErrorNote, StatusBadge, areaClass } from "./common";

const MESSAGE_LIMIT = 4000;

export function ConversationPage({ conversationKey }: { conversationKey: string }) {
  const queryClient = useQueryClient();
  const [older, setOlder] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<unknown>(null);
  const [replyText, setReplyText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSeenId = useRef<string | null>(null);

  useEffect(() => {
    setOlder([]);
    setHasOlder(null);
    setReplyText("");
    lastSeenId.current = null;
  }, [conversationKey]);

  const detail = useQuery({
    queryKey: qk.conversation(conversationKey),
    queryFn: () => fetchConversation(conversationKey),
    refetchInterval: 4000,
  });
  const latest = useQuery({
    queryKey: qk.messages(conversationKey),
    queryFn: () => fetchMessages(conversationKey),
    refetchInterval: 4000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.conversation(conversationKey) });
    void queryClient.invalidateQueries({ queryKey: qk.messages(conversationKey) });
    void queryClient.invalidateQueries({ queryKey: qk.conversationsAll });
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
  };

  const modeMutation = useMutation({
    mutationFn: (mode: "bot" | "manual") => setConversationMode(conversationKey, mode),
    onSuccess: refresh,
  });
  const sendMutation = useMutation({
    mutationFn: (text: string) => sendOwnerReply(conversationKey, text),
    onSuccess: () => {
      setReplyText("");
      refresh();
    },
  });

  const messages = useMemo(
    () => mergeMessages(older, latest.data?.items ?? []),
    [older, latest.data],
  );
  const canLoadOlder = hasOlder ?? latest.data?.has_more ?? false;
  const newestId = messages.at(-1)?._id ?? null;

  useEffect(() => {
    if (newestId && newestId !== lastSeenId.current) {
      lastSeenId.current = newestId;
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [newestId]);

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const page = await fetchMessages(conversationKey, oldest.created_at);
      setOlder((prev) => mergeMessages(page.items, prev));
      setHasOlder(page.has_more);
    } catch (err) {
      setOlderError(err);
    } finally {
      setLoadingOlder(false);
    }
  };

  const conv = detail.data;
  const notFound = detail.error instanceof ApiError && detail.error.status === 404;

  const submit = () => {
    const text = replyText.trim();
    if (!text || sendMutation.isPending) return;
    sendMutation.mutate(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div>
      <Link
        to="/app/inbox"
        className="mb-4 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />К диалогам
      </Link>
      {detail.isPending ? (
        <div className="app-card">
          <DataState state="loading" />
        </div>
      ) : notFound ? (
        <div className="app-card">
          <DataState
            state="empty"
            emptyTitle="Диалог не найден"
            emptyText="Возможно, ссылка устарела. Откройте диалог из списка «Входящие»."
          />
        </div>
      ) : detail.isError || !conv ? (
        <div className="app-card">
          <DataState state="error" error={detail.error} retry={() => void detail.refetch()} />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="app-card flex h-[calc(100dvh-13rem)] min-h-[520px] flex-col overflow-hidden md:h-[calc(100dvh-11rem)]">
            <ConversationHeader
              conv={conv}
              busy={modeMutation.isPending}
              onMode={(mode) => modeMutation.mutate(mode)}
            />
            <ModeBanner conv={conv} />
            <ErrorNote error={modeMutation.error} className="mx-4 mt-3" />
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              {canLoadOlder && (
                <div className="text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={loadOlder}
                    disabled={loadingOlder}
                  >
                    {loadingOlder ? "Загружаю…" : "Загрузить ранние сообщения"}
                  </Button>
                  <ErrorNote error={olderError} className="mt-2" />
                </div>
              )}
              {latest.isPending ? (
                <DataState state="loading" />
              ) : latest.isError && messages.length === 0 ? (
                <DataState state="error" error={latest.error} retry={() => void latest.refetch()} />
              ) : messages.length === 0 ? (
                <div className="mx-auto w-fit rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  Переписки пока нет
                </div>
              ) : (
                messages.map((m) => <MessageRow key={m._id} message={m} />)
              )}
              <div ref={bottomRef} />
            </div>
            <footer className="border-t border-border p-4">
              {!conv.can_reply ? (
                <p className="text-sm text-muted-foreground">
                  Ответить с сайта нельзя: у этого диалога нет Telegram-клиента или бот не настроен
                  на сервере.
                </p>
              ) : (
                <>
                  <div className="flex items-end gap-2">
                    <textarea
                      className={cn(areaClass, "max-h-40 min-h-11 resize-y")}
                      rows={2}
                      maxLength={MESSAGE_LIMIT}
                      placeholder="Написать клиенту… (Enter — отправить, Shift+Enter — новая строка)"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={onKeyDown}
                      aria-label="Ответ клиенту"
                    />
                    <Button
                      size="icon"
                      className="size-11 shrink-0 rounded-xl"
                      disabled={!replyText.trim() || sendMutation.isPending}
                      onClick={submit}
                      aria-label="Отправить"
                    >
                      <Send />
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {conv.mode === "bot"
                      ? "Ваш ответ переведёт диалог на вас — бот замолчит, пока вы ведёте переписку."
                      : "Сообщение уйдёт клиенту в Telegram от имени бота вашей компании."}
                  </p>
                  <ErrorNote error={sendMutation.error} className="mt-2" />
                </>
              )}
            </footer>
          </section>
          <ClientPanel conv={conv} messageCount={messages.length} />
        </div>
      )}
    </div>
  );
}

function ConversationHeader({
  conv,
  busy,
  onMode,
}: {
  conv: ConversationDetail;
  busy: boolean;
  onMode: (mode: "bot" | "manual") => void;
}) {
  const bot = conv.mode === "bot";
  const name = conv.name || conv.display_contact;
  return (
    <header className="grid grid-cols-1 items-center gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-info-soft font-bold text-info">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-bold">{name}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Send className="size-3 text-primary" />
            {channelOf(conv.channel, conv.contact)} · {conv.display_contact}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{bot ? "Бот включён" : "Ведёте вы"}</span>
          <Switch
            checked={bot}
            disabled={busy}
            onCheckedChange={(checked) => onMode(checked ? "bot" : "manual")}
          />
        </label>
        <Button
          className="rounded-xl"
          variant={bot ? "default" : "outline"}
          disabled={busy}
          onClick={() => onMode(bot ? "manual" : "bot")}
        >
          <User />
          {bot ? "Перехватить" : "Вернуть боту"}
        </Button>
      </div>
    </header>
  );
}

function ModeBanner({ conv }: { conv: ConversationDetail }) {
  if (conv.mode !== "manual") return null;
  const when = resumeText(conv.minutes_left);
  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b border-border px-4 py-3 text-sm",
        conv.awaiting_owner ? "bg-warning-soft text-warning" : "bg-info-soft text-info",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        {conv.awaiting_owner ? (
          <p className="font-semibold">
            Клиент ждёт вашего ответа{when ? ` — если не ответите, AI продолжит ${when}.` : "."}
          </p>
        ) : (
          <p className="font-semibold">
            Диалог ведёте вы. Бот молчит
            {when ? ` и вернётся ${when}, если не будет вашей активности.` : "."}
          </p>
        )}
        {conv.handoff_reason && (
          <p className="mt-0.5 text-xs opacity-90">Причина: {conv.handoff_reason}</p>
        )}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const time = formatTime(message.created_at);
  const clientText = message.notes ?? message.message;
  return (
    <div className="space-y-2">
      {clientText && (
        <Bubble side="client" time={time}>
          {clientText}
        </Bubble>
      )}
      {message.ai_response && (
        <Bubble
          side={replySide(message.answer_source)}
          time={time}
          label={replyLabel(message.answer_source, message.kind)}
          warn={message.delivery_failed ? "Не доставлено в Telegram" : undefined}
        >
          {message.ai_response}
        </Bubble>
      )}
    </div>
  );
}

function Bubble({
  side,
  time,
  label,
  warn,
  children,
}: {
  side: "client" | "bot" | "owner" | "system";
  time: string;
  label?: string | undefined;
  warn?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl p-3 text-sm leading-6 sm:max-w-[70%]",
        side === "client" && "mr-auto rounded-bl-sm bg-secondary",
        side === "bot" && "mx-auto border border-primary/20 bg-success-soft",
        side === "system" && "mx-auto border border-border bg-muted text-muted-foreground",
        side === "owner" && "ml-auto rounded-br-sm bg-primary text-primary-foreground",
      )}
    >
      {label && (
        <span
          className={cn(
            "mb-1 flex items-center gap-1 text-xs font-bold",
            side === "owner"
              ? "justify-end text-primary-foreground/80"
              : "justify-center text-primary",
          )}
        >
          {side === "owner" ? <User className="size-3" /> : <Bot className="size-3" />}
          {label}
        </span>
      )}
      <p>{children}</p>
      {warn && <p className="mt-1 text-xs font-semibold text-destructive">{warn}</p>}
      <p
        className={cn(
          "mt-1 text-right text-[11px]",
          side === "owner" ? "text-primary-foreground/70" : "text-muted-foreground",
        )}
      >
        {time}
      </p>
    </div>
  );
}

function ClientPanel({ conv, messageCount }: { conv: ConversationDetail; messageCount: number }) {
  const name = conv.name || conv.display_contact;
  return (
    <aside className="app-card h-fit p-5">
      <h2 className="font-bold">Клиент</h2>
      <div className="mt-5 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-info-soft text-xl font-bold text-info">
          {initials(name)}
        </div>
        <h3 className="mt-3 font-bold">{name}</h3>
        <div className="mt-2">
          <StatusBadge kind={conv.status} />
        </div>
      </div>
      <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
        <div>
          <dt className="text-muted-foreground">Telegram</dt>
          <dd className="font-semibold">{conv.display_contact}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Первое обращение</dt>
          <dd className="font-semibold">{formatTime(conv.first_at) || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Сообщений загружено</dt>
          <dd className="font-semibold">{messageCount}</dd>
        </div>
        {conv.pending_payments > 0 && (
          <div>
            <dt className="text-muted-foreground">Чеки на проверке</dt>
            <dd>
              <Link to="/app/payments" className="font-semibold text-primary">
                {conv.pending_payments} — открыть «Оплаты»
              </Link>
            </dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
