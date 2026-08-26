import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export type SwipeDirection = "left" | "right" | null;

interface UseSwipeNavigationOptions {
  /** Called instead of navigating when swiping forward past the last tab. */
  onSwipePastEnd?: () => void;
}

export function useSwipeNavigation(
  tabs: string[],
  options: UseSwipeNavigationOptions = {},
) {
  const { onSwipePastEnd } = options;
  const router = useRouter();
  const pathname = usePathname();
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [direction, setDirection] = useState<SwipeDirection>(null);

  const currentIndex = tabs.findIndex((t) => pathname.startsWith(t));
  const prevIndexRef = useRef(currentIndex);

  useEffect(() => {
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Clear the direction once the new route has mounted with it, so a later
  // navigation triggered another way (e.g. a sidebar click) doesn't replay
  // a stale swipe animation.
  useEffect(() => {
    if (direction === null) return;
    const timeout = setTimeout(() => setDirection(null), 300);
    return () => clearTimeout(timeout);
  }, [pathname, direction]);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Ignore if touch is inside a horizontal scroll container
    let el = e.target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      const style = window.getComputedStyle(el);
      if (
        (style.overflowX === "auto" || style.overflowX === "scroll") &&
        el.scrollWidth > el.clientWidth
      ) {
        return;
      }
      el = el.parentElement;
    }
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - touchStart.x;
    const diffY = endY - touchStart.y;

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (currentIndex !== -1) {
        if (diffX > 0 && currentIndex > 0) {
          // Swiped right: go to the previous tab
          setDirection("right");
          router.push(tabs[currentIndex - 1]);
        } else if (diffX < 0) {
          // Swiped left: go to the next tab, or past the end (e.g. "More")
          if (currentIndex < tabs.length - 1) {
            setDirection("left");
            router.push(tabs[currentIndex + 1]);
          } else if (currentIndex === tabs.length - 1) {
            onSwipePastEnd?.();
          }
        }
      }
    }
    setTouchStart(null);
  };

  return { handleTouchStart, handleTouchEnd, direction };
}
