import { useEffect, useState } from "react";

// Detects whether *any* available input mechanism is touch/coarse, unlike useIsTouchDevice's `(pointer:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-has-touch-capability-ts-L3
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
