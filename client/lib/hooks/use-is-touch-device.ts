import { useEffect, useState } from "react";

// Detects a touch-*primary* device (phone/tablet), not merely touch *capability*.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-is-touch-device-L3
export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouch(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isTouch;
}
