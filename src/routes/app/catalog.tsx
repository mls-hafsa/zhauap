import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/components/zhauap/catalog-page";

export const Route = createFileRoute("/app/catalog")({
  head: () => ({ meta: [{ title: "Каталог — Zhauap" }] }),
  component: CatalogPage,
});
