import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "better-themes";

import { ApiAuthAlert } from "@/components/layout/api-auth-alert";
import { DialogHost } from "@/components/layout/dialog-host";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { apiAuthQueryOptions } from "@/server/api-auth";

import appCss from "@/styles/app.css?url";

export interface AppRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
      {
        title: "Deko",
        description: "Deko - An API Observability tool for developers.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(apiAuthQueryOptions());
    } catch (error) {
      console.error(
        "[api-auth] Auth probe itself failed to run. This is a bug in the " +
          "probe, not an ADMIN_TOKEN problem.",
        error,
      );
    }
  },
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>

      <body className="font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
        >
          <TooltipProvider>
            <div className="relative isolate bg-background text-foreground antialiased selection:bg-muted-foreground selection:text-muted">
              <ApiAuthAlert />
              {children}
              <DialogHost />
            </div>
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
