import { useCallback } from "react";
import { useStore } from "@/lib/context/store-context";

// Product/category names are always stored lowercase (see withNormalizedName in base-helpers.ts); this per-store setting controls whether they…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-uppercase-display-ts-L4
export function useUppercaseDisplay(): boolean {
  const { storeProfile } = useStore();
  return storeProfile?.uppercase_display_enabled !== 0;
}

// Convenience for JSX className props:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-uppercase-display-ts-L14
export function useUppercaseDisplayClass(): string {
  return useUppercaseDisplay() ? "uppercase" : "capitalize";
}

// String-level equivalent of the `capitalize` CSS utility, for the plain- text export paths (CSV, PDF, printed labels) that have no CSS layer…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-uppercase-display-ts-L22
export function capitalizeWords(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Capitalizes only the first letter of a string, leaving the rest unchanged — sentence-style casing, not the per-word title casing of capitali…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-uppercase-display-ts-L30
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// String-level equivalent of useUppercaseDisplayClass(), for text that goes somewhere CSS cannot reach it — a toast body, a printed line, an a…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-uppercase-display-ts-L37
export function useDisplayName(): (value: string) => string {
  const uppercase = useUppercaseDisplay();
  // Stable identity: this ends up in addToCart's dep array, and a fresh
  // closure each render re-renders every visible POS product card.
  return useCallback(
    (value: string) => (uppercase ? value.toUpperCase() : capitalizeWords(value)),
    [uppercase],
  );
}
