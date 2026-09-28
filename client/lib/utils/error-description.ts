/**
 * The real reason a write failed, for a Sonner toast's `description` slot.
 * Procurement's catch blocks all reported the same shapeless
 * "Error creating purchase order" while the caught Error carried the actual
 * cause, so staff had nothing to act on and nothing to report.
 *
 * Returns undefined rather than an invented string when the thrown value has
 * no usable message: a toast with a blank or made-up subtitle is worse than
 * a toast with only its title.
 */
export function errorDescription(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return undefined;
}
