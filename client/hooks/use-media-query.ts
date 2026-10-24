import { useCallback, useSyncExternalStore } from "react";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// Reads `false` until hydration, the value baked into the static export.
// Rationale: docs/CLIENT_COMMENTS.md#line-hooks-use-media-query-ts-L4
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const result = matchMedia(query);
      result.addEventListener("change", onChange);
      return () => result.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => matchMedia(query).matches,
    () => false,
  );
}

// useMediaQuery plus the `resolved` flag a consumer needs before it may branch its render on the answer.
// Rationale: docs/CLIENT_COMMENTS.md#block-hooks-use-media-query-ts-L31
export function useResolvedMediaQuery(query: string): {
  matches: boolean;
  resolved: boolean;
} {
  const matches = useMediaQuery(query);
  const resolved = useHydrated();
  return { matches, resolved };
}
