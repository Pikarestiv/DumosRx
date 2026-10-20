import { STORAGE_KEYS } from "@/lib/storage-keys";
// Known bug #10, Part B (docs/features/_known-bugs.md):
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-post-restore-notice-L2

const RESTORE_FLAG_KEY = STORAGE_KEYS.justRestored;

// Call immediately before the post-restore reload/navigation (both the pre-login setup flow in app/setup/use-onboarding.ts and the in-app Sett…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-post-restore-notice-ts-L7
export function markRestoredForCloudLinkNotice(): void {
  try {
    sessionStorage.setItem(RESTORE_FLAG_KEY, "1");
  } catch {
    // sessionStorage unavailable (e.g. private mode edge cases) - the
    // one-time notice just won't fire; restore itself is unaffected.
  }
}

// Call once on mount of a page that can be the landing spot right after a post-restore reload (currently /login and the dashboard shell).
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-post-restore-notice-L33
export function consumePostRestoreCloudLinkNotice(isCloudLinked: boolean): boolean {
  let justRestored = false;
  try {
    justRestored = sessionStorage.getItem(RESTORE_FLAG_KEY) === "1";
    if (justRestored) {
      sessionStorage.removeItem(RESTORE_FLAG_KEY);
    }
  } catch {
    return false;
  }
  return justRestored && !isCloudLinked;
}
