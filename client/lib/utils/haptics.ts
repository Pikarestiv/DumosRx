const HAPTIC_SWITCH_ID = "dumosrx-ios-haptic-switch";

function isAppleTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function triggerIosSwitchHaptic(): void {
  if (typeof document === "undefined" || !document.body) return;
  let label = document.querySelector<HTMLLabelElement>(
    `label[for="${HAPTIC_SWITCH_ID}"]`,
  );
  if (!label) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = HAPTIC_SWITCH_ID;
    input.tabIndex = -1;
    input.setAttribute("switch", "");
    input.setAttribute("aria-hidden", "true");
    input.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;margin:0;";

    label = document.createElement("label");
    label.htmlFor = HAPTIC_SWITCH_ID;
    label.setAttribute("aria-hidden", "true");
    label.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;";
    label.appendChild(input);
    document.body.appendChild(label);
  }
  label.click();
}

export function triggerHapticFeedback(pattern: number | number[] = 10): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
      return;
    } catch {
      return;
    }
  }
  if (isAppleTouchDevice()) {
    try {
      triggerIosSwitchHaptic();
    } catch {
      return;
    }
  }
}
