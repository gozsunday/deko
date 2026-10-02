import { useEffect } from "react";

import { useSidebar } from "@/components/ui/sidebar";
import { useIsNavigating } from "@/hooks/use-is-navigating";

export function NavOverlay() {
  const isNavigating = useIsNavigating();
  const { isMobile, state } = useSidebar();

  const leftOffsetClass = isMobile
    ? "left-0"
    : state === "collapsed"
      ? "left-[var(--sidebar-width-icon)]"
      : "left-[var(--sidebar-width)]";

  // the overlay blocks the page, so hold the scroll while it is up
  useEffect(() => {
    document.body.style.overflow = isNavigating ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isNavigating]);

  return (
    <>
      {isNavigating ? (
        <div
          className={`fixed inset-y-0 right-0 isolate z-50 flex bg-black/60 duration-100 supports-backdrop-filter:backdrop-blur-xs ${leftOffsetClass}`}
        >
          <div className="flex h-dvh w-full items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-transparent border-t-foreground/60" />
          </div>
        </div>
      ) : null}
    </>
  );
}
