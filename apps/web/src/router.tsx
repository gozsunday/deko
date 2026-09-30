import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { routeTree } from "./routeTree.gen";

// should block the default react query retry mechanism from apply for all 
// 400 errors except for 408 and 429
const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= 3) return false;

  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== "number") {
    return true;
  }

  if (status === 408 || status === 429) return true;
  return status < 400 || status >= 500;
};

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchInterval: 15_000,
        retry: shouldRetryQuery,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "render",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 30_000,
    notFoundMode: "root",
  });
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
};
