export const DEFAULT_ENABLED_PAYMENT_METHODS = ["cash", "card", "transfer", "credit", "mixed"];

// stores.enabled_payment_methods is TEXT holding JSON, not a real array column.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#payment-methods-ts-L3
export function parseEnabledPaymentMethods(raw: string | null | undefined): string[] {
  if (!raw) return DEFAULT_ENABLED_PAYMENT_METHODS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : DEFAULT_ENABLED_PAYMENT_METHODS;
  } catch {
    return DEFAULT_ENABLED_PAYMENT_METHODS;
  }
}
