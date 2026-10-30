import { useQuery } from "@tanstack/react-query";
import { fetchStats, qk } from "@/lib/queries";
import { DataState, SectionHeader } from "./common";

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="app-card p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ResultsPage() {
  const stats = useQuery({ queryKey: qk.stats, queryFn: fetchStats, refetchInterval: 30_000 });
  return (
    <>
      <SectionHeader
        title="Результаты"
        subtitle="Сводная статистика по реальным сообщениям клиентов"
      />
      {stats.isPending ? (
        <div className="mt-6 app-card">
          <DataState state="loading" />
        </div>
      ) : stats.isError ? (
        <div className="mt-6 app-card">
          <DataState state="error" error={stats.error} retry={() => void stats.refetch()} />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Всего сообщений"
            value={stats.data.total_leads}
            hint={`Сегодня: ${stats.data.messages_today}`}
          />
          <StatCard
            label="Ответил бот"
            value={stats.data.total_bot_replies}
            hint="AI и база знаний"
          />
          <StatCard label="Ответили вы" value={stats.data.owner_replies} />
          <StatCard label="Клиентов" value={stats.data.active_leads} />
          <StatCard
            label="Передано владельцу"
            value={stats.data.handoffs}
            hint="AI или клиент попросили человека"
          />
          <StatCard label="Ждут вашего ответа" value={stats.data.waiting_owner} />
          <StatCard label="Чеков на проверке" value={stats.data.pending_payments} />
        </div>
      )}
    </>
  );
}
