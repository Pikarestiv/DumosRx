import { afterAll } from "vitest";

/**
 * Longest of the three timers `input-otp` schedules per OTP-input mount
 * (0ms / 10ms / 50ms — its internal `syncTimeouts` helper), plus slack.
 */
const INPUT_OTP_SYNC_TIMEOUT_DRAIN_MS = 75;

// Call from any test file that mounts an OTP input (`components/ui/input-otp`, or anything embedding it:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-helpers-input-otp-timers-ts-L9
export function drainInputOtpSyncTimeouts(): void {
  afterAll(async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, INPUT_OTP_SYNC_TIMEOUT_DRAIN_MS),
    );
  });
}
