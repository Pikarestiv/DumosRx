/**
 * Bounds on error text that gets embedded into a NEW log message.
 *
 * A database-level push failure surfaces as the driver's full error string,
 * which includes the entire attempted SQL statement — and therefore a
 * verbatim copy of the row it was inserting. Embedding that in a new crash
 * description, which is itself stored as a row and pushed again, makes every
 * generation contain all previous ones (see docs/FIXED_BUGS.md, SF-CRASH-1).
 * Capping the embedded text at a fixed length makes that growth impossible
 * regardless of how large the underlying error is.
 */
export const MAX_EMBEDDED_ERROR_LENGTH = 300;

/** Matches the server's `/logs/client-error` `message` rule
 * (ActivityLogController::MAX_MESSAGE_LENGTH), so an oversized crash message
 * is truncated rather than silently 422-rejected on arrival. */
export const MAX_CRASH_MESSAGE_LENGTH = 2000;

/** Matches the server's `feedback.fingerprint` column width
 * (VARCHAR(255), widened to match this by
 * 2026_10_02_000006_widen_feedback_fingerprint_column after A-149 found it
 * silently 191), so a long area/message/stack combination cannot push a row
 * the server rejects forever with SQLSTATE[22001]. */
export const MAX_FINGERPRINT_LENGTH = 255;

/**
 * Bounds on the crash `content` the local `feedback` row carries. The server
 * column is MySQL TEXT: 65,535 **bytes**, not characters. A character can
 * cost up to 4 bytes in utf8mb4, so the character cap is set at a quarter of
 * the byte limit — the only cap that holds for any input, since JavaScript
 * string length counts UTF-16 units and says nothing about encoded size.
 *
 * The per-part caps exist so one oversized part cannot crowd out the others:
 * a 60,000-frame stack must not push the message and device out of the
 * report that is supposed to explain the crash.
 */
export const MAX_CRASH_CONTENT_LENGTH = 16_000;
export const MAX_CRASH_STACK_LENGTH = 8_000;
export const MAX_CRASH_CONTEXT_LENGTH = 2_000;

export const TRUNCATION_MARKER = "…[truncated]";

export function truncateForLog(
  message: string,
  maxLength: number = MAX_EMBEDDED_ERROR_LENGTH,
): string {
  if (typeof message !== "string") return String(message);
  if (message.length <= maxLength) return message;
  return `${message.slice(0, maxLength)}${TRUNCATION_MARKER}`;
}

/**
 * Unlike truncateForLog, the result never exceeds `maxLength` — the marker is
 * accounted for inside the budget rather than appended past it, so the output
 * can be handed straight to a fixed-width column.
 */
export function truncateToLimit(text: string, maxLength: number): string {
  if (typeof text !== "string") return String(text);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - TRUNCATION_MARKER.length))}${TRUNCATION_MARKER}`;
}
