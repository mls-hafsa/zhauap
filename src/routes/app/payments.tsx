import { createFileRoute } from "@tanstack/react-router";
import { PaymentsPage } from "@/components/zhauap/payments-page";

export const Route = createFileRoute("/app/payments")({
  head: () => ({ meta: [{ title: "Оплаты — Zhauap" }] }),
  component: PaymentsPage,
});
