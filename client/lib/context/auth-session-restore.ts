import { setCurrentUser as setDbUser } from "@/lib/db/local-database";
import { isTauri } from "@/lib/db";
import { getToken } from "@/lib/api/token-manager";
import { mirrorAuthToken } from "@/lib/native/widget-bridge";
import { isTillInspectionSession } from "@/lib/utils/till-inspection";
import {
  IMPERSONATED_USER_STORAGE_KEY,
  isImpersonatedSession,
} from "@/lib/utils/impersonation";
import {
  STORAGE_KEYS,
  getAuthToken,
  getStoredUser,
  clearStoredUser,
} from "@/lib/storage-keys";
import type { User } from "@/lib/context/auth-context";

export interface SavedSession {
  user: User | null;
  fromStoredUser: boolean;
  corruption: "impersonated" | "stored" | null;
  isCloudLinked: boolean;
  isImpersonating: boolean;
  isInspecting: boolean;
}

const NO_SESSION: SavedSession = {
  user: null,
  fromStoredUser: false,
  corruption: null,
  isCloudLinked: false,
  isImpersonating: false,
  isInspecting: false,
};

function readSavedUser(): Pick<SavedSession, "user" | "fromStoredUser" | "corruption"> {
  // Checked BEFORE the normal savedUser branch below:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L219
  const savedImpersonatedUser = localStorage.getItem(IMPERSONATED_USER_STORAGE_KEY);
  if (savedImpersonatedUser) {
    try {
      return { user: JSON.parse(savedImpersonatedUser) as User, fromStoredUser: false, corruption: null };
    } catch {
      return { user: null, fromStoredUser: false, corruption: "impersonated" };
    }
  }
  const savedUser = getStoredUser();
  if (savedUser) {
    return { user: savedUser as unknown as User, fromStoredUser: true, corruption: null };
  }
  const corrupt = localStorage.getItem(STORAGE_KEYS.user) !== null;
  return { user: null, fromStoredUser: false, corruption: corrupt ? "stored" : null };
}

export function readSavedSession(): SavedSession {
  if (typeof window === "undefined") return NO_SESSION;
  return {
    ...readSavedUser(),
    isCloudLinked: !!getAuthToken(),
    // Evaluated after the user read (not inside it) so a session that holds only the impersonator return code — e.g.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L242
    isImpersonating: isImpersonatedSession(),
    isInspecting: isTillInspectionSession(),
  };
}

export function applySavedSessionSideEffects(session: SavedSession) {
  // Backfill: anyone already logged in when the widget feature ships has their token sitting in localStorage with nothing to trigger a mirror in…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L204
  if (isTauri()) {
    const existingToken = getToken();
    if (existingToken) void mirrorAuthToken(existingToken);
  }

  if (session.corruption === "impersonated") {
    console.error("Failed to parse saved impersonated user, clearing corrupted session");
    localStorage.removeItem(IMPERSONATED_USER_STORAGE_KEY);
  } else if (session.corruption === "stored") {
    // Corrupted/partial write (e.g.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L235
    console.error("Clearing a corrupted saved user session");
    clearStoredUser();
  }

  if (session.fromStoredUser) setDbUser(session.user);
}
