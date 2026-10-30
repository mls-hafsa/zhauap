import { createFileRoute } from "@tanstack/react-router";
import { ConversationPage } from "@/components/zhauap/conversation-page";

export const Route = createFileRoute("/app/inbox/$key")({
  head: () => ({ meta: [{ title: "Диалог — Zhauap" }] }),
  component: ConversationRoute,
});

function ConversationRoute() {
  const { key } = Route.useParams();
  return <ConversationPage conversationKey={key} />;
}
