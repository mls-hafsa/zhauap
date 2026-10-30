import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/zhauap/landing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zhauap — AI-администратор для клиентских сообщений" },
      {
        name: "description",
        content:
          "Zhauap отвечает клиентам в Telegram по вашему каталогу, принимает чеки и передаёт сложные вопросы владельцу.",
      },
      { property: "og:title", content: "Zhauap — AI-администратор для бизнеса" },
      {
        property: "og:description",
        content:
          "Ответы клиентам по вашим данным, передача владельцу и приём оплат — в одном окне.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Landing,
});
