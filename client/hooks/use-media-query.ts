import { useState, useEffect } from "react";

export function useMediaQuery(query: string) {
  // Always start at `false`, even on the client: this app is statically
  // exported (`output: "export"`), so the build has no `window` and bakes
  // `false` into the HTML. Lazy-reading the real matchMedia value here made
  // the client's first render disagree with that static HTML whenever the
  // real value was `true` (e.g. any desktop-width user), which React
  // reports as a hydration-mismatch crash — not a caught render exception,
  // so it never reached Sentry via the error boundary. Consumers that used
  // to rely on the real value being available immediately (ResponsiveModal
  // picking Dialog vs Drawer) should gate their first real render on a
  // `mounted` flag instead, rather than reaching for the value early here.
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

/**
 * useMediaQuery plus the `resolved` flag a consumer needs before it may
 * branch its render on the answer. Because the raw hook deliberately starts
 * at `false` until its effect runs, choosing between a mobile and a desktop
 * component tree off the uncorrected value mounts the wrong one first and
 * then throws it away — a wasted mount plus a visible flash of the wrong
 * layout. React batches this hook's `resolved` effect with the underlying
 * one's correction into a single re-render, so the first render where
 * `resolved` is true already carries the real value.
 */
export function useResolvedMediaQuery(query: string): {
  matches: boolean;
  resolved: boolean;
} {
  const matches = useMediaQuery(query);
  const [resolved, setResolved] = useState(false);
  useEffect(() => setResolved(true), []);
  return { matches, resolved };
}
