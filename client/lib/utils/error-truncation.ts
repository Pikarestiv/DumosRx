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
 * (VARCHAR(255), see 2026_09_27_000002_add_dedup_columns_to_feedback_table),
 * so a long area/message/stack combination cannot push a row the server
 * rejects forever with SQLSTATE[22001]. */
export const MAX_FINGERPRINT_LENGTH = 255;

export const TRUNCATION_MARKER = "…[truncated]";

export function truncateForLog(
  message: string,
  maxLength: number = MAX_EMBEDDED_ERROR_LENGTH,
): string {
  if (typeof message !== "string") return String(message);
  if (message.length <= maxLength) return message;
  return `${message.slice(0, maxLength)}${TRUNCATION_MARKER}`;
}
