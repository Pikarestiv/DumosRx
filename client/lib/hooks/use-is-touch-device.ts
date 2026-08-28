import { useEffect, useState } from "react";

/**
 * Detects a touch-*primary* device (phone/tablet), not merely touch
 * *capability*. `navigator.maxTouchPoints`/`ontouchstart` are true for any
 * touchscreen device, including a touchscreen laptop/2-in-1 with a trackpad
 * and physical keyboard - that previously made this hook report `true` on
 * e.g. a Dell Latitude 2-in-1, which forced the on-screen PIN pad and
 * disabled the sidebar's hover-peek on a device that has a perfectly good
 * keyboard and trackpad. `(pointer: coarse)` reflects the *primary* input's
 * precision: a 2-in-1's trackpad/mouse makes its primary pointer fine even
 * though touch is also available, while a real phone/tablet has no fine
 * pointer at all. Same pointer/hover pair `app/globals.css` already uses to
 * gate `:hover` styles project-wide, for the same reason.
 */
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
