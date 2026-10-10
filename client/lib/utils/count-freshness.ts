/**
 * How stale this device's view of the cloud may be before a stock count
 * stops being trustworthy. Justified in client/AGENTS.md, "Counting on a
 * device that is behind sync (A-211)".
 */
export const COUNT_STALE_AFTER_MINUTES = 60;

export function minutesSince(
  iso: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((now - at) / 60_000));
}

export function isCountBaselineStale(
  lastSuccessfulSyncIso: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const minutes = minutesSince(lastSuccessfulSyncIso, now);
  return minutes === null || minutes >= COUNT_STALE_AFTER_MINUTES;
}
