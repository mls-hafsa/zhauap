import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Instagram, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createLinkCode, fetchTelegramSettings, qk, unlinkTelegram } from "@/lib/queries";
import type { LinkCode } from "@/lib/types";
import { copyText } from "@/lib/clipboard";
import { ChannelRow, DataState, ErrorNote, SectionHeader, fieldClass } from "./common";

export function ChannelsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: qk.telegram,
    queryFn: fetchTelegramSettings,
    refetchInterval: 10_000,
  });
  const [copied, setCopied] = useState("");
  const [code, setCode] = useState<LinkCode | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.telegram });
    void queryClient.invalidateQueries({ queryKey: qk.me });
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
  };
  const codeMutation = useMutation({ mutationFn: createLinkCode, onSuccess: setCode });
  const unlinkMutation = useMutation({
    mutationFn: unlinkTelegram,
    onSuccess: () => {
      setCode(null);
      refresh();
    },
  });

  const copy = async (text: string, what: string) => {
    if (await copyText(text)) {
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    }
  };

  if (settings.isPending) return <DataState state="loading" />;
  if (settings.isError || !settings.data)
    return <DataState state="error" error={settings.error} retry={() => void settings.refetch()} />;
  const tg = settings.data;
  const linkedNow = tg.owner_linked && code !== null;

  return (
    <>
      <SectionHeader
        title="Каналы"
        subtitle="Мессенджеры, через которые бот общается с клиентами"
      />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="app-card p-5">
          <h3 className="font-bold">Ссылка для клиентов</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Разместите её в профиле Instagram, на сайте или отправьте клиентам. Все сообщения по ней
            попадут в ваш кабинет, а бот будет отвечать по вашему каталогу.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              readOnly
              value={tg.client_link}
              className={cn(fieldClass, "flex-1")}
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              className="rounded-xl"
              onClick={() => copy(tg.client_link, "link")}
            >
              {copied === "link" ? "Скопировано" : "Копировать"}
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            <ChannelRow
              icon={Send}
              title="Telegram"
              detail={
                tg.bot_configured
                  ? `Работает через бота @${tg.bot_username}`
                  : "Бот не настроен на сервере (нет TELEGRAM_TOKEN) — обратитесь к администратору"
              }
            />
            <ChannelRow icon={MessageCircle} title="WhatsApp" detail="Скоро" />
            <ChannelRow icon={Instagram} title="Instagram" detail="Скоро" />
          </div>
        </div>

        <div className="app-card p-5">
          <h3 className="font-bold">Telegram владельца</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Сюда бот присылает уведомления: клиент ждёт вашего ответа, AI передал вам вопрос, пришёл
            новый чек. Через этот же Telegram можно восстановить пароль.
          </p>
          {tg.owner_linked ? (
            <div className="mt-4 rounded-xl bg-success-soft p-4 text-sm text-success">
              <p className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="size-4" />
                {linkedNow ? "Готово! Telegram привязан." : "Telegram привязан"}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 rounded-xl"
                disabled={unlinkMutation.isPending}
                onClick={() => {
                  if (confirm("Отвязать Telegram? Уведомления перестанут приходить."))
                    unlinkMutation.mutate();
                }}
              >
                Отвязать
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {!code ? (
                <Button
                  className="rounded-xl"
                  onClick={() => codeMutation.mutate()}
                  disabled={codeMutation.isPending}
                >
                  {codeMutation.isPending ? "Создаю код…" : "Получить код привязки"}
                </Button>
              ) : (
                <div className="space-y-3 rounded-xl border border-border p-4 text-sm">
                  <p>
                    Код действует 15 минут и срабатывает один раз. Откройте ссылку — бот привяжет
                    ваш Telegram автоматически:
                  </p>
                  <Button asChild className="w-full rounded-xl">
                    <a href={code.deep_link} target="_blank" rel="noreferrer">
                      <Send />
                      Открыть @{tg.bot_username}
                    </a>
                  </Button>
                  <p className="text-muted-foreground">Или отправьте боту команду:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-xl bg-secondary p-3 font-mono">
                      {code.command}
                    </code>
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => copy(code.command, "cmd")}
                    >
                      {copied === "cmd" ? "Скопировано" : "Копировать"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Статус обновится здесь сам после привязки.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => codeMutation.mutate()}
                  >
                    Новый код
                  </Button>
                </div>
              )}
            </div>
          )}
          <ErrorNote error={codeMutation.error ?? unlinkMutation.error} className="mt-3" />
        </div>
      </div>
    </>
  );
}
