/** True once the app is running as an installed PWA (Android/desktop
 * `display-mode: standalone`) or iOS's equivalent `navigator.standalone`. */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}
