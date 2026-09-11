import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouteLoading } from "./components/common/RouteLoading";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultStaleTime: 5 * 60_000,
    defaultGcTime: 30 * 60_000,
    defaultPreloadStaleTime: 60_000,
    defaultPendingComponent: RouteLoading,
    defaultPendingMs: 1200,
    defaultPendingMinMs: 200,
  });

  return router;
};
