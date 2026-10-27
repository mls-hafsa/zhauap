import { createFileRoute } from "@tanstack/react-router";
import { ZhauapApp } from "@/components/zhauap-app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zhauap — AI-ассистент для клиентских сообщений" },
      { name: "description", content: "Zhauap отвечает клиентам в мессенджерах и помогает возвращать тех, кто перестал отвечать." },
      { property: "og:title", content: "Zhauap — AI-ассистент для бизнеса" },
      { property: "og:description", content: "Ответы клиентам, запись и автоматический возврат — в одном окне." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: ZhauapApp,
});
