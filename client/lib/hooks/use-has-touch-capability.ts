import { useEffect, useState } from "react";

/**
 * Detects whether *any* available input mechanism is touch/coarse, unlike
 * useIsTouchDevice's `(pointer: coarse)` which only reflects the *primary*
 * pointer (deliberately `false` on a 2-in-1 with a trackpad). Hover-reveal
 * affordances (e.g. a row's edit pencil) need this instead: a 2-in-1's
 * trackpad makes it primary-pointer-fine, but a user tapping its touchscreen
 * directly still never fires `:hover`, so the affordance must stay visible
 * whenever touch is available at all, not just when it's the primary input.
 */
export function useHasTouchCapability() {
  const [hasTouch, setHasTouch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const query = window.matchMedia("(any-pointer: coarse)");
    const update = () => setHasTouch(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return hasTouch;
}
