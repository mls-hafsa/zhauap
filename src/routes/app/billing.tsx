import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@/components/zhauap/billing-page";

export const Route = createFileRoute("/app/billing")({
  head: () => ({ meta: [{ title: "Тариф — Zhauap" }] }),
  component: BillingPage,
});
