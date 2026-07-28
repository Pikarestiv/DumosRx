import { useEffect, useState } from "react";

/**
 * Detects real touch capability rather than trusting viewport width or user-agent
 * string matching. Neither of those is reliable here: iPadOS masks its user agent
 * to look like a Mac by default (Apple did this deliberately so sites treat iPad
 * as desktop), so `/iPad/i.test(navigator.userAgent)` usually fails on a real iPad;
 * and a touch tablet can easily have a "desktop-width" viewport (landscape iPad is
 * 1024px). `navigator.maxTouchPoints > 1` is the standard trick for spotting a real
 * touch device even when the UA string is spoofed to look like a mouse-driven one.
 */
export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const touchCapable =
      typeof navigator !== "undefined" &&
      (navigator.maxTouchPoints > 1 || "ontouchstart" in window);
    setIsTouch(touchCapable);
  }, []);

  return isTouch;
}
