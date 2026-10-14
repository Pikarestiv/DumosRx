/**
 * Whether `intervalMs` has passed since a stored timestamp.
 *
 * A stamp in the future reads as **due**, not as "this just ran". A device
 * whose clock is ahead writes that future time into localStorage, and the
 * obvious `now - stored < interval` then skips the work until real time
 * catches up — hours on the fast till A-247 measured, and for ever on a clock
 * that has been reset. The work this guards includes the daily health check,
 * which carries the stock-drift repair, so the failure is silent and takes the
 * cure with it.
 *
 * An absent, unparseable or non-finite stamp is also due: not knowing when
 * something last ran is a reason to run it, never a reason to skip it.
 */
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
