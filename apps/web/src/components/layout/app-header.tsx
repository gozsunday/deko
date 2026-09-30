// oxlint-disable jsx_a11y/no-static-element-interactions

import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { PeriodSelector } from "@/components/layout/period-selector";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useApiFailure } from "@/hooks/use-api-failure";
import { cn } from "@/lib/utils";
import {
  $getSingleService,
  singleServiceQueryOptions,
} from "@/server/services";
import { useNavigationStore } from "@/stores/navigation-store";

const PAGE_SEGMENT_TITLES: Record<string, string> = {
  overview: "Overview",
  logs: "Logs",
  errors: "Errors",
  endpoints: "Endpoints",
  settings: "Settings",
};

export function AppHeader() {
  const getSingleService = useServerFn($getSingleService);
  const { serviceId } = useParams({ from: "/_app/services/$serviceId" });
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const queryClient = useQueryClient();

  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const isNavigating = useNavigationStore((s) => s.isNavigating);

  const failure = useApiFailure();
  const hasError = failure !== null;

  const { data: service, isPending } = useQuery({
    ...singleServiceQueryOptions(serviceId),
    queryFn: () => getSingleService({ data: serviceId }),
  });

  const handleRefresh = () => {
    if (isCoolingDown) return;
    queryClient.refetchQueries();
    setIsCoolingDown(true);
    setTimeout(() => setIsCoolingDown(false), 10_000);
  };

  // oxlint-disable-next-line unicorn/prefer-array-find
  const lastSegment = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const title = PAGE_SEGMENT_TITLES[lastSegment] ?? "Deko";

  const homeHref = serviceId ? `/services/${serviceId}/overview` : "/";

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-background px-4">
      <div className="flex items-center gap-1.5">
        <SidebarTrigger size={"icon"} className="-ml-1" />
        <span
          aria-hidden="true"
          className="mr-2 ml-1 h-4 w-px shrink-0 self-center bg-border/70"
        />
        <Breadcrumb className="mr-12">
          <BreadcrumbList className="max-w-[40svw] flex-nowrap">
            <BreadcrumbItem>
              <BreadcrumbLink href={homeHref} className="line-clamp-1">
                {isPending ? "Loading..." : (service?.name ?? "Deko")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "mr-1 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors",
            hasError && "text-destructive",
          )}
        >
          <span className="relative flex size-2">
            {isNavigating ? (
              <span className="relative inline-flex size-2 rounded-full bg-muted-foreground/40" />
            ) : hasError ? (
              <>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75 animation-duration-[1500ms]" />
                <span className="relative inline-flex size-2 rounded-full bg-red-500" />
              </>
            ) : (
              <>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </>
            )}
          </span>
          <span className="hidden sm:inline">
            {isNavigating ? "Loading" : hasError ? "Error" : "Live"}
          </span>
        </div>

        <span
          aria-hidden="true"
          className="mx-1 h-4 w-px shrink-0 self-center bg-border/70"
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isCoolingDown}
                onClick={handleRefresh}
              />
            }
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              strokeWidth={2}
              className={isCoolingDown ? "animate-spin" : ""}
            />
            <span className="sr-only">Refresh</span>
          </TooltipTrigger>
          <TooltipContent>
            {isCoolingDown ? "Refreshed" : "Refresh data"}
          </TooltipContent>
        </Tooltip>

        <PeriodSelector />
      </div>
    </header>
  );
}
