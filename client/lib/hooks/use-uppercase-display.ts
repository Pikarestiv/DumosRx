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
 * `capitalize` when the store has turned the setting off — raw lowercase
 * (e.g. "cypri gold small syrup") reads as broken/unfinished, so "off" means
 * sentence-style capitalization, not literally untouched storage casing. */
export function useUppercaseDisplayClass(): string {
  return useUppercaseDisplay() ? "uppercase" : "capitalize";
}

/** String-level equivalent of the `capitalize` CSS utility, for the plain-
 * text export paths (CSV, PDF, printed labels) that have no CSS layer to
 * apply it at render time — see product-export.ts, use-report-export.ts,
 * purchase-order-details.tsx. */
export function capitalizeWords(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Capitalizes only the first letter of a string, leaving the rest
 * unchanged — sentence-style casing, not the per-word title casing of
 * capitalizeWords() above. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** String-level equivalent of useUppercaseDisplayClass(), for text that goes
 * somewhere CSS cannot reach it — a toast body, a printed line, an aria
 * label. Mirrors that hook exactly: uppercase when the store wants it,
 * otherwise per-word capitalization, never raw storage lowercase. */
export function useDisplayName(): (value: string) => string {
  const uppercase = useUppercaseDisplay();
  return (value: string) => (uppercase ? value.toUpperCase() : capitalizeWords(value));
}
