import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/zhauap/settings-page";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Настройки — Zhauap" }] }),
  component: SettingsPage,
});
