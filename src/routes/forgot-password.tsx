import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/zhauap/auth-page";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [{ title: "Восстановление пароля — Zhauap" }, { name: "robots", content: "noindex" }],
  }),
  component: ForgotRoute,
});

function ForgotRoute() {
  return <AuthPage initialMode="forgot" />;
}
