import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

// Тот же тип контекста, что кладётся в router.tsx: context: { queryClient }
interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  // Достаём queryClient из контекста роутера (его туда положил router.tsx)
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
