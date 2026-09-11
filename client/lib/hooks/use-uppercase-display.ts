import { useStore } from "@/lib/context/store-context";

/** Product/category names are always stored lowercase (see withNormalizedName
 * in base-helpers.ts); this per-store setting controls whether they render
 * uppercase via CSS or plain lowercase. Defaults to on (matches the
 * `uppercase_display_enabled` column's `DEFAULT 1`) so a store that hasn't
 * touched the setting yet sees the same uppercase look this shipped with. */
export function useUppercaseDisplay(): boolean {
  const { storeProfile } = useStore();
  return storeProfile?.uppercase_display_enabled !== 0;
}

/** Convenience for JSX className props: the Tailwind `uppercase` utility, or
 * "" when the store has turned the setting off. */
export function useUppercaseDisplayClass(): string {
  return useUppercaseDisplay() ? "uppercase" : "";
}
