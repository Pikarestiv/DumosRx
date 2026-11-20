export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const isMatchMediaStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches;
  const isIosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const isTwa = typeof document !== "undefined" && document.referrer.startsWith("android-app://");
  return isMatchMediaStandalone || isIosStandalone || isTwa;
}
