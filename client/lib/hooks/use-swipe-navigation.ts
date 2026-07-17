import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export function useSwipeNavigation(tabs: string[]) {
  const router = useRouter();
  const pathname = usePathname();
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const currentIndex = tabs.findIndex((t) => pathname.startsWith(t));
  const prevIndexRef = useRef(currentIndex);

  useEffect(() => {
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

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
          router.push(tabs[currentIndex - 1]);
        } else if (diffX < 0 && currentIndex < tabs.length - 1) {
          router.push(tabs[currentIndex + 1]);
        }
      }
    }
    setTouchStart(null);
  };

  return { handleTouchStart, handleTouchEnd };
}
