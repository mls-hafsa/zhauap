import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/zhauap/auth-page";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Вход — Zhauap" }, { name: "robots", content: "noindex" }] }),
  component: LoginRoute,
});

function LoginRoute() {
  return <AuthPage initialMode="login" />;
}
