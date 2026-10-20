// Forward bound for anything that records "now" into durable state.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#licensing-monotonic-clock-ts-L1

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

// The highest wall-clock value worth recording, given what the monotonic clock can actually justify.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#licensing-monotonic-clock-ts-L36
export function boundedWallClock(wallMs: number = Date.now()): number {
  if (anchor === null) {
    anchor = { wallMs, perfMs: perfNow() };
    return wallMs;
  }

  const projected = anchor.wallMs + Math.max(0, perfNow() - anchor.perfMs);
  const ceiling = projected + MAX_FORWARD_DRIFT_MS;

  // Anchor and return the PROJECTED value, never the ceiling:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-licensing-monotonic-clock-ts-L41
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
