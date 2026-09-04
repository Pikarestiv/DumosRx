/**
 * Known bug #10, Part B (docs/features/_known-bugs.md): restoreDatabase()
 * only swaps the sql.js database - it never touches localStorage/auth_token,
 * so a device recovering via a local .drx backup silently loses its cloud
 * link with nothing on the restore screen or the post-restore dashboard
 * telling the owner sync is now off.
 *
 * We deliberately do NOT try to make the cloud auth token survive a restore
 * (a portable backup file should never carry a live/expiring session
 * credential, let alone a plaintext password - see the known-bugs entry).
 * Instead we make the gap loud, once, right after a restore: a short-lived
 * sessionStorage marker set immediately before the post-restore reload
 * distinguishes "just restored" from "has always been unlinked" (which is
 * already covered by the persistent header SyncIndicator "Not Linked"
 * state - this is not meant to duplicate that as a persistent nag).
 */

const RESTORE_FLAG_KEY = "dumos_just_restored";

/** Call immediately before the post-restore reload/navigation (both the
 * pre-login setup flow in app/setup/use-onboarding.ts and the in-app
 * Settings > Data flow in hooks/use-settings-sync.ts). */
export function markRestoredForCloudLinkNotice(): void {
  try {
    sessionStorage.setItem(RESTORE_FLAG_KEY, "1");
  } catch {
    // sessionStorage unavailable (e.g. private mode edge cases) - the
    // one-time notice just won't fire; restore itself is unaffected.
  }
}

/**
 * Call once on mount of a page that can be the landing spot right after a
 * post-restore reload (currently /login and the dashboard shell).
 *
 * Consumes (clears) the "just restored" marker so it can only ever answer
 * `true` once per restore, regardless of the outcome - a normal subsequent
 * page load (marker absent) always returns false, and so does a restore
 * where the device turns out to still be cloud-linked.
 *
 * `isCloudLinked` is intentionally read as a plain boolean argument, not
 * pulled from localStorage/context internally: callers already have it
 * (from useAuth() or a direct localStorage.getItem("auth_token") check),
 * and keeping this function pure makes the "fires once, only when
 * unlinked" behavior trivial to unit test.
 */
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
