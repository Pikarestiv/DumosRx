// Bounds on error text that gets embedded into a NEW log message.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-error-truncation-L1
export const MAX_EMBEDDED_ERROR_LENGTH = 300;

// Matches the server's `/logs/client-error` `message` rule (ActivityLogController::MAX_MESSAGE_LENGTH), so an oversized crash message is trunc…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-error-truncation-ts-L5
export const MAX_CRASH_MESSAGE_LENGTH = 2000;

// Matches the server's `feedback.fingerprint` column width (VARCHAR(255), widened to match this by 2026_10_02_000006_widen_feedback_fingerprin…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-error-truncation-ts-L10
export const MAX_FINGERPRINT_LENGTH = 255;

// Bounds on the crash `content` the local `feedback` row carries.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-error-truncation-L26
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

// Unlike truncateForLog, the result never exceeds `maxLength` — the marker is accounted for inside the budget rather than appended past it, so…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-error-truncation-ts-L34
export function truncateToLimit(text: string, maxLength: number): string {
  if (typeof text !== "string") return String(text);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - TRUNCATION_MARKER.length))}${TRUNCATION_MARKER}`;
}
