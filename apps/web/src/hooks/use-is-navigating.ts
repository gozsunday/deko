import { useRouterState } from "@tanstack/react-router";

export function useIsNavigating(): boolean {
  // the same signals TanStack's Transitioner uses for `isAnyPending`;
  // `hasPendingMatches` has no public equivalent, so match status stands in
  return useRouterState({
    select: (state) =>
      state.isLoading ||
      state.isTransitioning ||
      state.matches.some((match) => match.status === "pending"),
  });
}
