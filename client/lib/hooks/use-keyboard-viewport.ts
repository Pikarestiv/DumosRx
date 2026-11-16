import { useEffect } from "react";

const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true']";

export function useKeyboardViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;

    const publish = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        root.style.setProperty("--vv-height", `${viewport.height}px`);
        root.style.setProperty("--vv-top", `${viewport.offsetTop}px`);
        root.style.setProperty("--kb-inset", `${inset}px`);
      });
    };

    const revealFocusedField = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches(FIELD_SELECTOR)) return;
      if (target.closest("[data-vaul-drawer]")) return;
      window.setTimeout(() => {
        const { top, bottom } = target.getBoundingClientRect();
        const isCovered = bottom > viewport.offsetTop + viewport.height - 8 || top < viewport.offsetTop;
        if (isCovered) target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 300);
    };

    publish();
    viewport.addEventListener("resize", publish);
    viewport.addEventListener("scroll", publish);
    document.addEventListener("focusin", revealFocusedField);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", publish);
      viewport.removeEventListener("scroll", publish);
      document.removeEventListener("focusin", revealFocusedField);
    };
  }, []);
}
