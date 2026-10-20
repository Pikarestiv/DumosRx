// Whether `intervalMs` has passed since a stored timestamp.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-elapsed-L1
export function isIntervalElapsed(
  storedAt: number | string | null | undefined,
  intervalMs: number,
  now: number = Date.now(),
): boolean {
  const stamp = toMillis(storedAt);

  if (!Number.isFinite(stamp)) return true;
  if (stamp > now) return true;

  return now - stamp >= intervalMs;
}

/** Both forms are in use: `health-check` stores epoch milliseconds as a
 *  string, `retention` stores an ISO timestamp. */
function toMillis(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return Number.NaN;

  const epoch = Number(value);
  return Number.isFinite(epoch) ? epoch : Date.parse(value);
}
