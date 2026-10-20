// The real reason a write failed, for a Sonner toast's `description` slot.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-error-description-L1
export function errorDescription(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return undefined;
}
