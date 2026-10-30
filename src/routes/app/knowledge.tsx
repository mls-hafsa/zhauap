import { createFileRoute } from "@tanstack/react-router";
import { KnowledgePage } from "@/components/zhauap/knowledge-page";

export const Route = createFileRoute("/app/knowledge")({
  head: () => ({ meta: [{ title: "База знаний — Zhauap" }] }),
  component: KnowledgePage,
});
