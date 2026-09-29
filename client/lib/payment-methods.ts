export const DEFAULT_ENABLED_PAYMENT_METHODS = ["cash", "card", "transfer", "credit", "mixed"];

/**
 * stores.enabled_payment_methods is TEXT holding JSON, not a real array
 * column. NULL/absent means the store never chose, which enables every
 * method; a malformed or double-encoded value (docs/FIXED_BUGS.md A-29,
 * A-31, A-42) must fall back the same way rather than throwing mid-render.
 */
export function parseEnabledPaymentMethods(raw: string | null | undefined): string[] {
  if (!raw) return DEFAULT_ENABLED_PAYMENT_METHODS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : DEFAULT_ENABLED_PAYMENT_METHODS;
  } catch {
    return DEFAULT_ENABLED_PAYMENT_METHODS;
  }
}
