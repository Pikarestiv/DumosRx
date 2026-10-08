/**
 * Forward bound for anything that records "now" into durable state.
 *
 * `performance.now()` is monotonic and unaffected by wall-clock changes, so
 * comparing its delta against the wall clock's delta reveals a clock that
 * jumped rather than advanced. See
 * docs/superpowers/specs/2026-10-08-license-clock-recovery-design.md §2.
 */

/** Slack for scheduler jitter and a suspended tab whose monotonic clock
 * pauses while the wall clock does not. */
export const MAX_FORWARD_DRIFT_MS = 5 * 60 * 1000;

interface ClockAnchor {
  wallMs: number;
  perfMs: number;
}

let anchor: ClockAnchor | null = null;

function perfNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** Re-anchors to a wall-clock value known to be trustworthy (server time). */
export function anchorClock(trustedWallMs: number): void {
  anchor = { wallMs: trustedWallMs, perfMs: perfNow() };
}

export function resetClockAnchor(): void {
  anchor = null;
}

/**
 * The highest wall-clock value worth recording, given what the monotonic
 * clock can actually justify. A clock that leaps forward is clamped to the
 * projected value rather than written as-is.
 *
 * Clamping only ever lowers the result, so the failure mode is a slightly
 * conservative watermark — weaker rollback detection, never a lockout. That
 * direction is deliberate: A-191 was a store unable to sell.
 */
export function boundedWallClock(wallMs: number = Date.now()): number {
  if (anchor === null) {
    anchor = { wallMs, perfMs: perfNow() };
    return wallMs;
  }

  const projected = anchor.wallMs + Math.max(0, perfNow() - anchor.perfMs);
  const ceiling = projected + MAX_FORWARD_DRIFT_MS;

  // Anchor and return the PROJECTED value, never the ceiling: the slack
  // decides when to clamp, and must not accumulate into what gets written.
  // Returning the ceiling let each clamped write add another MAX_FORWARD_DRIFT
  // on top of the last, so a fast clock re-poisoned the watermark by degrees.
  if (wallMs > ceiling) {
    anchor = { wallMs: projected, perfMs: perfNow() };
    return projected;
  }

  if (wallMs > anchor.wallMs) {
    anchor = { wallMs, perfMs: perfNow() };
  }

  return wallMs;
}

export function boundedNowIso(): string {
  return new Date(boundedWallClock()).toISOString();
}
