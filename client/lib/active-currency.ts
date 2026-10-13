/**
 * The active store's currency, held at module level so the money formatters
 * in lib/utils.ts can default to it.
 *
 * Every `formatCurrency(amount)` call that omits a code used to render naira
 * no matter what the store was set to - 77 of the app's ~147 call sites,
 * which is how a Cameroonian (XAF) store saw "N40,000" in a procurement
 * confirmation. Passing the code down to all of them is both a large diff
 * and a rule nothing enforces, so the default itself now follows the store.
 *
 * Same shape as getActiveStoreId()/getCurrentUserId() in lib/db/core.ts, and
 * the same caveat: before StoreContext resolves the profile this is null and
 * the formatters fall back to NGN, so a screen rendering money in the first
 * moments after boot can still flash the wrong symbol. Anything whose
 * correctness depends on the currency (receipts, exports, PDFs) should keep
 * passing `storeProfile.currency` explicitly rather than relying on this.
 */
let activeCurrency: string | null = null;

export function setActiveCurrency(code: string | null | undefined) {
  activeCurrency = code || null;
}

export function getActiveCurrency(): string | null {
  return activeCurrency;
}
