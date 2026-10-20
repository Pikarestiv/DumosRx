import { useState, useEffect } from "react";

export function useMediaQuery(query: string) {
  // Always start at `false`, even on the client:
  // Rationale: docs/CLIENT_COMMENTS.md#line-hooks-use-media-query-ts-L4
  const [value, setValue] = useState(false);

  useEffect(() => {
    function onChange(event: MediaQueryListEvent) {
      setValue(event.matches);
    }

    const result = matchMedia(query);
    result.addEventListener("change", onChange);
    setValue(result.matches);

    return () => result.removeEventListener("change", onChange);
  }, [query]);

  return value;
}

// useMediaQuery plus the `resolved` flag a consumer needs before it may branch its render on the answer.
// Rationale: docs/CLIENT_COMMENTS.md#block-hooks-use-media-query-ts-L31
export function useResolvedMediaQuery(query: string): {
  matches: boolean;
  resolved: boolean;
} {
  const matches = useMediaQuery(query);
  const [resolved, setResolved] = useState(false);
  useEffect(() => setResolved(true), []);
  return { matches, resolved };
}
