import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/zhauap/auth-page";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [{ title: "Регистрация — Zhauap" }, { name: "robots", content: "noindex" }],
  }),
  component: RegisterRoute,
});

function RegisterRoute() {
  return <AuthPage initialMode="register" />;
}
