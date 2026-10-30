import { createFileRoute } from "@tanstack/react-router";
import { ChannelsPage } from "@/components/zhauap/channels-page";

export const Route = createFileRoute("/app/channels")({
  head: () => ({ meta: [{ title: "Каналы — Zhauap" }] }),
  component: ChannelsPage,
});
