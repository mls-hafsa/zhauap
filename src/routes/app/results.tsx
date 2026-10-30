import { createFileRoute } from "@tanstack/react-router";
import { ResultsPage } from "@/components/zhauap/results-page";

export const Route = createFileRoute("/app/results")({
  head: () => ({ meta: [{ title: "Результаты — Zhauap" }] }),
  component: ResultsPage,
});
