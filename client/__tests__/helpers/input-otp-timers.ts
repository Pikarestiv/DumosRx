import { afterAll } from "vitest";

/**
 * Longest of the three timers `input-otp` schedules per OTP-input mount
 * (0ms / 10ms / 50ms — its internal `syncTimeouts` helper), plus slack.
 */
const INPUT_OTP_SYNC_TIMEOUT_DRAIN_MS = 75;

/**
 * Call from any test file that mounts an OTP input (`components/ui/input-otp`,
 * or anything embedding it: PinEntry, StaffFormFields, ConfirmDialog's PIN
 * step, LockScreen, the register step).
 *
 * `input-otp` schedules three `setTimeout`s on mount and clears none of them
 * on unmount; each one ends in a React `setState`. A test file that finishes
 * while one is still pending has it delivered AFTER Vitest has torn that
 * file's jsdom environment down, at which point React's
 * `resolveUpdatePriority` reads `window` and throws `ReferenceError: window
 * is not defined` as a process-level uncaught exception. Every test still
 * passes and the run still exits 1 — see client/AGENTS.md, "All tests passed
 * but the run still exited 1". Draining the timers here, while `window` is
 * still alive, keeps them entirely inside the test file that created them.
 */
export function drainInputOtpSyncTimeouts(): void {
  afterAll(async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, INPUT_OTP_SYNC_TIMEOUT_DRAIN_MS),
    );
  });
}
