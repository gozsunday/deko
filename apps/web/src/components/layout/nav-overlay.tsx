import { useEffect } from "react";

import { useSidebar } from "@/components/ui/sidebar";
import { useIsNavigating } from "@/hooks/use-is-navigating";
import { useNavigationOverlayStore } from "@/stores/navigation-overlay-store";

export function NavOverlay() {
  const isNavigating = useIsNavigating();
  const suppressed = useNavigationOverlayStore((s) => s.suppressed);
  const { isMobile, state } = useSidebar();

  // a search-param-only navigation still transitions, but the page is not
  // going anywhere, so blocking would only stop the user changing filters
  const blocking = isNavigating && !suppressed;

  const leftOffsetClass = isMobile
    ? "left-0"
    : state === "collapsed"
      ? "left-[var(--sidebar-width-icon)]"
      : "left-[var(--sidebar-width)]";

  // the overlay blocks the page, so hold the scroll while it is up
  useEffect(() => {
    document.body.style.overflow = blocking ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [blocking]);

  if (!blocking) return null;

  return (
    <div
      className={`fixed inset-y-0 right-0 isolate z-50 flex bg-black/60 duration-100 supports-backdrop-filter:backdrop-blur-xs ${leftOffsetClass}`}
    >
      <div className="flex h-dvh w-full items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-transparent border-t-foreground/60" />
      </div>
    </div>
  );
}
