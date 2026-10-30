import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/zhauap/app-shell";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Zhauap" }, { name: "robots", content: "noindex" }] }),
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
