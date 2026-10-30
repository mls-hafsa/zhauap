import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "@/components/zhauap/inbox-page";

export const Route = createFileRoute("/app/inbox/")({
  head: () => ({ meta: [{ title: "Входящие — Zhauap" }] }),
  component: InboxPage,
});
