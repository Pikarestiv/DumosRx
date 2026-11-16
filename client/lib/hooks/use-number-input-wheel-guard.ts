import { useEffect } from "react";

export function useNumberInputWheelGuard() {
  useEffect(() => {
    const blurFocusedNumberInput = (event: WheelEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        target.type === "number" &&
        target === document.activeElement
      ) {
        target.blur();
      }
    };
    document.addEventListener("wheel", blurFocusedNumberInput, { passive: true });
    return () => document.removeEventListener("wheel", blurFocusedNumberInput);
  }, []);
}
