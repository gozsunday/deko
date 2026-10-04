import { create } from "zustand";

interface NavigationOverlayStore {
  /**
   * Set while a page changes only its search params. Those navigations still
   * put the router in a transitioning state, which would raise the blocking
   * overlay, but the page is not going anywhere, so the overlay is just in the
   * way of the control the user is still using.
   */
  suppressed: boolean;
  suppress: () => void;
  release: () => void;
}

export const useNavigationOverlayStore = create<NavigationOverlayStore>()(
  (set) => ({
    suppressed: false,
    suppress: () => set({ suppressed: true }),
    release: () => set({ suppressed: false }),
  }),
);
