import { useState, useEffect } from "react";

export function useMediaQuery(query: string) {
  // Lazy-initialize from the real value instead of always starting at
  // `false`. ResponsiveModal picks Dialog vs Drawer off this hook, and a
  // `false`-then-corrected first render meant it briefly mounted the wrong
  // one (Drawer) before swapping to Dialog on desktop — two different
  // libraries each doing their own body scroll-lock in the same tick, which
  // could leave `document.body.style.pointerEvents` stuck at "none" after
  // close. SSR has no `window`, so this still falls back to `false` there,
  // same as before.
  const [value, setValue] = useState(() =>
    typeof window !== "undefined" ? matchMedia(query).matches : false
  );

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
