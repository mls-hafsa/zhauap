import { createFileRoute } from "@tanstack/react-router";
import { Onboarding } from "@/components/zhauap/onboarding";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Настройка — Zhauap" }, { name: "robots", content: "noindex" }] }),
  component: Onboarding,
});
