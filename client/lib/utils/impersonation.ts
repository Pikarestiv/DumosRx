import { STORAGE_KEYS } from "@/lib/storage-keys";
// Single source of truth for "is this session an impersonated (superadmin handoff) session?".
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-impersonation-L2
export const IMPERSONATED_USER_STORAGE_KEY = STORAGE_KEYS.impersonatedUser;
export const IMPERSONATOR_RETURN_CODE_KEY = STORAGE_KEYS.impersonatorReturnCode;

// True when this device currently holds an impersonated (superadmin handoff) session.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-impersonation-ts-L7
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
