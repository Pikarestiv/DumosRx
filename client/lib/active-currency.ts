// The active store's currency, held at module level so the money formatters in lib/utils.ts can default to it.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#active-currency-L1
let activeCurrency: string | null = null;

export function setActiveCurrency(code: string | null | undefined) {
  activeCurrency = code || null;
}

export function getActiveCurrency(): string | null {
  return activeCurrency;
}
