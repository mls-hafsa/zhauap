import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  BookOpen,
  CreditCard,
  Inbox,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Package,
  Receipt,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ApiError, UNAUTHORIZED_EVENT } from "@/lib/api";
import { formatTime, initials, resumeText } from "@/lib/chat-utils";
import { fetchMe, fetchNotifications, logout, qk } from "@/lib/queries";
import { DataState, Logo, type IconType } from "./common";

type AppPath =
  | "/app/inbox"
  | "/app/channels"
  | "/app/catalog"
  | "/app/knowledge"
  | "/app/payments"
  | "/app/results"
  | "/app/billing"
  | "/app/settings";

type NavItem = { to: AppPath; label: string; icon: IconType };

const NAV: NavItem[] = [
  { to: "/app/inbox", label: "Входящие", icon: Inbox },
  { to: "/app/channels", label: "Каналы", icon: MessageSquare },
  { to: "/app/catalog", label: "Каталог", icon: Package },
  { to: "/app/knowledge", label: "База знаний", icon: BookOpen },
  { to: "/app/payments", label: "Оплаты", icon: Receipt },
  { to: "/app/results", label: "Результаты", icon: BarChart3 },
  { to: "/app/billing", label: "Тариф", icon: CreditCard },
  { to: "/app/settings", label: "Настройки", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menu, setMenu] = useState(false);

  const me = useQuery({ queryKey: qk.me, queryFn: fetchMe, retry: false, staleTime: 60_000 });
  const notifications = useQuery({
    queryKey: qk.notifications,
    queryFn: fetchNotifications,
    enabled: !!me.data,
    refetchInterval: 15_000,
  });

  const unauthorized = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (unauthorized) void navigate({ to: "/login" });
  }, [unauthorized, navigate]);

  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.clear();
      void navigate({ to: "/login" });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [navigate, queryClient]);

  const needOwner = notifications.data?.need_owner ?? 0;
  const totalAlerts = notifications.data?.total ?? 0;

  useEffect(() => {
    document.title = totalAlerts > 0 ? `(${totalAlerts}) Zhauap` : "Zhauap";
  }, [totalAlerts]);

  useEffect(() => setMenu(false), [pathname]);

  const doLogout = async () => {
    try {
      await logout();
    } catch {
      // сервер недоступен — локальное состояние всё равно очищаем
    }
    queryClient.clear();
    await navigate({ to: "/" });
  };

  if (me.isPending || unauthorized) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-center">
          <Logo />
          <p className="mt-4 text-sm text-muted-foreground">Загрузка кабинета…</p>
        </div>
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <div className="app-card w-full max-w-md">
          <DataState state="error" error={me.error} retry={() => void me.refetch()} />
        </div>
      </div>
    );
  }

  const account = me.data;
  const trialLeft = account.trial_days_left;
  const trialPercent = Math.max(0, Math.min(100, (trialLeft / 14) * 100));
  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="flex h-12 items-center">
          <Logo />
        </div>
        <nav className="mt-6 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              active={isActive(item.to)}
              badge={
                item.to === "/app/inbox"
                  ? needOwner
                  : item.to === "/app/payments"
                    ? notifications.data?.pending_payments
                    : undefined
              }
            />
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-border bg-background p-4">
          <p className="text-sm font-bold">Пробный период</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {account.trial_active ? `Осталось ${trialLeft} дн.` : "Истёк"}
          </p>
          <Progress value={trialPercent} className="mt-3 h-1.5" />
          <Button asChild className="mt-4 w-full rounded-xl" size="sm">
            <Link to="/app/billing">Выбрать тариф</Link>
          </Button>
        </div>
        <button
          onClick={doLogout}
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
        <div className="hidden min-w-0 truncate text-sm font-semibold md:block">
          {account.business_name}
        </div>
        <div className="flex items-center gap-3">
          <NotificationsBell data={notifications.data} />
          <Link
            to="/app/settings"
            title={account.email}
            className="grid size-9 place-items-center rounded-full bg-info-soft text-sm font-bold text-info"
          >
            {initials(account.business_name, "Z").charAt(0)}
          </Link>
        </div>
      </header>
      <main className="md:ml-64">
        <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-surface/95 px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur md:hidden">
        {NAV.slice(0, 4).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "relative flex min-w-0 flex-col items-center gap-1 rounded-lg py-2 text-[10px]",
              isActive(item.to) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" />
            <span className="truncate">{item.label}</span>
            {item.to === "/app/inbox" && needOwner > 0 && (
              <span className="absolute right-3 top-1 rounded-full bg-warning px-1 text-[9px] font-bold text-background">
                {needOwner}
              </span>
            )}
          </Link>
        ))}
        <button
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
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
          {NAV.slice(4).map((item) => (
            <NavLink key={item.to} item={item} active={isActive(item.to)} />
          ))}
          <button
            onClick={doLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-secondary"
          >
            <LogOut className="size-4" />
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}

function NavLink({
  item,
  active,
  badge,
}: {
  item: NavItem;
  active: boolean;
  badge?: number | undefined;
}) {
  return (
    <Link
      to={item.to}
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
    </Link>
  );
}

function NotificationsBell({
  data,
}: {
  data: Awaited<ReturnType<typeof fetchNotifications>> | undefined;
}) {
  const [open, setOpen] = useState(false);
  const total = data?.total ?? 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={total > 0 ? `Уведомления: ${total}` : "Уведомления"}
          className="relative grid size-9 place-items-center rounded-xl border border-border text-muted-foreground hover:text-foreground"
        >
          <Bell className="size-4" />
          {total > 0 && (
            <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-warning px-1 text-center text-[10px] font-bold leading-5 text-background">
              {total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-0">
        <div className="border-b border-border p-4">
          <p className="font-bold">Уведомления</p>
          <p className="text-xs text-muted-foreground">Обновляются автоматически</p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {!data || total === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Всё спокойно — никто не ждёт вашего ответа.
            </p>
          ) : (
            <>
              {data.items.map((item) => (
                <Link
                  key={item.key}
                  to="/app/inbox/$key"
                  params={{ key: item.key }}
                  onClick={() => setOpen(false)}
                  className="block border-b border-border p-4 hover:bg-secondary/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{item.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatTime(item.at)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.text}</p>
                  {item.minutes_left !== null && (
                    <p className="mt-1 text-xs font-semibold text-warning">
                      Ждёт ответа · AI ответит {resumeText(item.minutes_left)}
                    </p>
                  )}
                </Link>
              ))}
              {data.pending_payments > 0 && (
                <Link
                  to="/app/payments"
                  onClick={() => setOpen(false)}
                  className="block p-4 text-sm font-semibold hover:bg-secondary/50"
                >
                  🧾 Чеков на проверке: {data.pending_payments}
                </Link>
              )}
            </>
          )}
        </div>
        {data && !data.owner_telegram_linked && (
          <Link
            to="/app/channels"
            onClick={() => setOpen(false)}
            className="block border-t border-border p-4 text-xs text-primary"
          >
            Привяжите свой Telegram, чтобы получать уведомления и на телефон →
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
