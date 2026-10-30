import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchMe, qk } from "@/lib/queries";
import { SectionHeader } from "./common";

const PLANS = [
  {
    name: "Старт",
    price: "2 900 ₸",
    desc: "Для одного мастера",
    features: ["Telegram", "300 AI-ответов в месяц", "Перехват диалога"],
  },
  {
    name: "Стандарт",
    price: "6 900 ₸",
    desc: "Для растущей студии",
    features: ["1 500 AI-ответов", "База знаний и каталог", "Уведомления владельцу"],
  },
  {
    name: "Премиум",
    price: "14 900 ₸",
    desc: "Для команды",
    features: ["5 000 AI-ответов", "Приоритетная поддержка", "Новые каналы первыми"],
  },
];

export function BillingPage() {
  const me = useQuery({ queryKey: qk.me, queryFn: fetchMe });
  return (
    <>
      <SectionHeader
        title="Тариф"
        subtitle={
          me.data
            ? me.data.trial_active
              ? `Пробный период: осталось ${me.data.trial_days_left} дн. Онлайн-оплата пока не подключена — цены ознакомительные.`
              : "Пробный период закончился. Онлайн-оплата пока не подключена — напишите нам, чтобы продлить доступ."
            : "Онлайн-оплата пока не подключена — цены ознакомительные."
        }
      />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {PLANS.map((p, i) => (
          <div key={p.name} className={cn("app-card p-6", i === 1 && "border-primary active-glow")}>
            <h3 className="font-bold">{p.name}</h3>
            <p className="mt-4 text-3xl font-extrabold">
              {p.price} <span className="text-sm font-normal text-muted-foreground">/мес</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="size-4 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            <Button className="mt-6 w-full rounded-xl" variant="outline" disabled>
              Оплата скоро
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}
