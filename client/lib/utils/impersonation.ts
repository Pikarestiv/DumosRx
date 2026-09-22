/**
 * Single source of truth for "is this session an impersonated (superadmin
 * handoff) session?".
 *
 * Two localStorage flags describe an impersonated session, both written when
 * a superadmin hands off into this app (see app/auth/callback/page.tsx):
 *
 *  - IMPERSONATED_USER_STORAGE_KEY: the impersonated profile itself, written
 *    by auth-context's loginFromHandoff() under a key distinct from
 *    "dumos_user" so it is never restored through setDbUser().
 *  - IMPERSONATOR_RETURN_CODE_KEY: the one-time code for the trip back to the
 *    admin panel, used by ImpersonationBanner's "End Session" button.
 *
 * Either one alone is enough to mean "impersonated": the return code is only
 * stored when the admin panel managed to mint one (that mint can fail while
 * the impersonation itself still proceeds — see web/app/admin/stores/page.tsx),
 * and the profile key is what survives a reload. Both are cleared together by
 * a real PIN login, a logout, and the banner's own "End Session".
 *
 * Lives in its own (React-free) module so the sync engine, the auth context
 * and the UI all answer this question the same way rather than each poking at
 * localStorage with its own hard-coded key.
 */
export const IMPERSONATED_USER_STORAGE_KEY = "dumos_impersonated_user";
export const IMPERSONATOR_RETURN_CODE_KEY = "impersonator_handoff_return_code";

/** True when this device currently holds an impersonated (superadmin handoff)
 * session. Safe to call during SSR/prerender and when localStorage access
 * itself throws (private-mode Safari, blocked storage): both answer false. */
export function isImpersonatedSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      !!localStorage.getItem(IMPERSONATED_USER_STORAGE_KEY) ||
      !!localStorage.getItem(IMPERSONATOR_RETURN_CODE_KEY)
    );
  } catch {
    return false;
  }
}

/** Clears every trace of an impersonated session from this device. */
export function clearImpersonatedSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(IMPERSONATED_USER_STORAGE_KEY);
    localStorage.removeItem(IMPERSONATOR_RETURN_CODE_KEY);
  } catch {
    /* storage unavailable; nothing to clear */
  }
}

/** The error string sync() returns when it refuses to run because the
 * session is impersonated. Exported so UI and tests assert one literal. */
export const SYNC_DISABLED_IMPERSONATION_MESSAGE =
  "Sync disabled: impersonated session (read-only support access).";
