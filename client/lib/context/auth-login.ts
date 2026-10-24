import * as Sentry from "@sentry/nextjs";
import { setCurrentUser as setDbUser, logAction } from "@/lib/db/local-database";
import {
  shouldAttemptAdminTillLogin,
  requestAdminTillSession,
  TILL_CODE_LENGTH,
  UNIFORM_REJECTION,
  OFFLINE_MESSAGE,
} from "@/lib/api/admin-till-session";
import { startTillInspectionSession } from "@/lib/utils/till-inspection";
import {
  getUsersByUsernameOrEmail,
  createDefaultAdmin,
  migrateLegacyPinToHash,
} from "@/lib/db/queries/auth";
import { pinMatches, needsPinRehash } from "@/lib/utils/pin-hash";
import { getTotalUserCount } from "@/lib/db/queries/setup";
import {
  checkLoginLockout,
  recordLoginFailure,
  recordLoginSuccess,
  formatLockoutRemaining,
} from "@/lib/utils/login-lockout";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import { sync, isSyncing } from "@/lib/db/sync-engine";
import { queryClient } from "@/lib/query-client";
import { clearLocalDrafts } from "@/lib/utils/clear-local-drafts";
import { setActiveStoreId as setResolvedStoreId } from "@/lib/db/core";
import { clearImpersonatedSession } from "@/lib/utils/impersonation";
import {
  getAuthToken,
  setStoredUser,
  getRecentUsers,
  setRecentUsers,
  setStoredActiveStoreId,
} from "@/lib/storage-keys";
import type { RecentUser } from "@/lib/types/user";
import type { User } from "@/lib/context/auth-context";

const MAX_RECENT_USERS = 5;

export interface LoginSessionSetters {
  setUser: (user: User) => void;
  setIsInspecting: (value: boolean) => void;
  setIsImpersonating: (value: boolean) => void;
}

// Polls until any in-flight sync finishes, so a caller that just triggered (or piggybacked on) a sync can safely read fresh local data afterwa…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L67
async function waitForSyncToFinish(timeoutMs = 8000, pollMs = 150) {
  const deadline = Date.now() + timeoutMs;
  while (isSyncing() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

// Throttles the PIN-mismatch recovery sync below (module-scope, not per component instance, since a locked screen can remount).
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L78
let lastPinRecoverySyncAt = 0;
const PIN_RECOVERY_SYNC_COOLDOWN_MS = 10_000;

// The documented default PIN for the zero-users bootstrap admin (see login()'s fallback branch below).
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L85
const DEFAULT_ADMIN_PIN = "1234";

// Dedupe by username, not id:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L537
function rememberRecentUser(profile: User) {
  const recentUser: RecentUser = {
    id: profile.id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    username: profile.username,
    role: profile.role,
    last_login: new Date().toISOString(),
  };
  const others = getRecentUsers().filter(
    (u) => u.username.toLowerCase() !== recentUser.username.toLowerCase(),
  );
  setRecentUsers([recentUser, ...others].slice(0, MAX_RECENT_USERS));
}

export async function performLogin(
  identifier: string,
  pin: string | undefined,
  previousUserId: string | undefined,
  setters: LoginSessionSetters,
): Promise<boolean> {
  // For local-first, we check both username and email
  const cleanIdentifier = identifier.trim();

  // Only a genuine PIN-based attempt is throttled - login(email) with no pin (the post-cloud-sync auto-login in app/setup/use-onboarding.ts) nev…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L278
  if (pin) {
    const lockout = checkLoginLockout(cleanIdentifier);
    if (lockout.locked) {
      throw new Error(
        `Too many failed attempts. Try again in ${formatLockoutRemaining(lockout.remainingMs)}.`,
      );
    }
  }

  let candidates = await getUsersByUsernameOrEmail(cleanIdentifier);

  // An email that matches no user on this device is the on-till admin path.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L294
  if (
    pin?.length === TILL_CODE_LENGTH &&
    shouldAttemptAdminTillLogin(cleanIdentifier, candidates.length)
  ) {
    if (!navigator.onLine) {
      throw new Error(OFFLINE_MESSAGE);
    }

    const session = await requestAdminTillSession(cleanIdentifier, pin).catch(
      () => null,
    );

    if (!session) {
      recordLoginFailure(cleanIdentifier);
      throw new Error(UNIFORM_REJECTION);
    }

    // Never both: sync-engine hard-disables sync for an impersonated
    // session, while the inspection banner states sync keeps running.
    clearImpersonatedSession();
    startTillInspectionSession(session);
    setters.setIsInspecting(true);
    setters.setIsImpersonating(false);

    // Deliberately does NOT unlock() or set dumos_session_authenticated.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L325
    return true;
  }
  // Usernames are unique per store, not globally (UNIQUE(store_id, username)) — on a multi-store device, more than one row can share this identi…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L333
  let matches = pin ? candidates.filter((u) => pinMatches(pin, u.pin)) : candidates;
  let dbUser = matches[0] ?? null;

  if (dbUser || candidates.length > 0) {
    // If PIN is provided, check it
    if (pin && !dbUser) {
      // A PIN reset via the web dashboard writes straight to the cloud DB; this device only sees it once it next syncs down, which could otherwise b…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L346
      const now = Date.now();
      const hasCloudLink =
        typeof window !== "undefined" && !!getAuthToken();
      if (
        hasCloudLink &&
        navigator.onLine &&
        now - lastPinRecoverySyncAt > PIN_RECOVERY_SYNC_COOLDOWN_MS
      ) {
        lastPinRecoverySyncAt = now;
        const result = await sync().catch(() => null);
        // If a background/setup sync was already in flight, our call above was a no-op; the pull we're relying on may still be running.
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L362
        if (result?.error === "Sync already in progress") {
          await waitForSyncToFinish();
        }
        candidates = await getUsersByUsernameOrEmail(cleanIdentifier);
        matches = candidates.filter((u) => pinMatches(pin, u.pin));
        dbUser = matches[0] ?? null;
      }
    }

    // More than one of this device's stores has a user with this exact identifier AND this exact PIN — a genuine collision (plausible with default…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L374
    if (pin && matches.length > 1) {
      logAction(AUDIT_ACTIONS.LOGIN_FAILED, "users", cleanIdentifier, {
        username: cleanIdentifier,
        reason: "ambiguous_multi_store_match",
        matchedStoreIds: matches.map((u) => u.store_id).join(","),
      }).catch(() => {});
      recordLoginFailure(cleanIdentifier);
      throw new Error(
        "This username and PIN match staff at more than one store on this device. Contact your admin to use a unique username, or sign in from a device scoped to a single store.",
      );
    }

    if (!dbUser || (pin && !pinMatches(pin, dbUser.pin))) {
      // The acting user_id on this row will be whoever was previously logged in on this device (or null), not the failed identifier:
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L393
      logAction(AUDIT_ACTIONS.LOGIN_FAILED, "users", dbUser?.id || cleanIdentifier, {
        username: cleanIdentifier,
        reason: "invalid_pin",
      }).catch(() => {});
      if (pin) recordLoginFailure(cleanIdentifier);
      return false;
    }

    // The PIN just verified against a LEGACY plaintext value:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L408
    if (pin && needsPinRehash(dbUser.pin)) {
      void migrateLegacyPinToHash(dbUser.id, pin);
    }

    const userProfile: User = {
      id: dbUser.id,
      first_name: dbUser.first_name || "",
      last_name: dbUser.last_name || "",
      username: dbUser.username || "",
      role: dbUser.role as User["role"],
      store_id: dbUser.store_id,
    };

    // A store-pinned account (staff whose users.store_id is set, as opposed to an owner/admin with access to every store on this device) makes the…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L427
    if (dbUser.store_id) {
      setResolvedStoreId(dbUser.store_id);
      setStoredActiveStoreId(dbUser.store_id);
    }

    // Covers the "switch user" lock-screen flow (selecting a different recent user and unlocking with their PIN), which calls login() directly wit…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L461
    void queryClient.cancelQueries();
    queryClient.clear();
    // Same shared-terminal risk as logout():
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L474
    if (previousUserId && previousUserId !== dbUser.id) {
      clearLocalDrafts();
    }

    setters.setUser(userProfile);
    setDbUser(userProfile);
    Sentry.setUser({ id: userProfile.id, username: userProfile.username, role: userProfile.role });
    setStoredUser(userProfile);
    // Marks this tab as already having gone through a real auth/unlock this session.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L495
    sessionStorage.setItem("dumos_session_authenticated", "1");
    // Any successful login means "not locked", full stop, regardless of which screen triggered it.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L501
    useAutoLockStore.getState().unlock();
    // Same idea for a stale impersonation banner:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L507
    clearImpersonatedSession();
    setters.setIsImpersonating(false);

    rememberRecentUser(userProfile);

    logAction(AUDIT_ACTIONS.LOGIN, "users", userProfile.id, {
      username: userProfile.username,
    }).catch(() => {});

    recordLoginSuccess(cleanIdentifier);
    return true;
  }

  // Fallback: bootstrap a default admin, but ONLY on a genuinely fresh device with zero local users - previously this fired for ANY typed PIN wh…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L559
  if (cleanIdentifier.toLowerCase() === "admin" && pin === DEFAULT_ADMIN_PIN) {
    const totalUsers = await getTotalUserCount();
    if (totalUsers > 0) {
      logAction(AUDIT_ACTIONS.LOGIN_FAILED, "users", cleanIdentifier, {
        username: cleanIdentifier,
        reason: "default_admin_blocked_users_exist",
      }).catch(() => {});
      return false;
    }

    const defaultAdmin: User = {
      id: "default-admin",
      first_name: "Default",
      last_name: "Admin",
      username: "admin",
      role: "admin",
    };
    
    // Attempt to persist the default admin to DB
    try {
      await createDefaultAdmin({
        id: defaultAdmin.id,
        first_name: defaultAdmin.first_name,
        last_name: defaultAdmin.last_name,
        username: defaultAdmin.username,
        pin: DEFAULT_ADMIN_PIN,
        role: defaultAdmin.role
      });
    } catch (e) {
      console.error("Failed to persist default admin", e);
    }

    setters.setUser(defaultAdmin);
    setDbUser(defaultAdmin);
    setStoredUser(defaultAdmin);
    sessionStorage.setItem("dumos_session_authenticated", "1");
    useAutoLockStore.getState().unlock();
    clearImpersonatedSession();
    setters.setIsImpersonating(false);

    rememberRecentUser(defaultAdmin);

    logAction(AUDIT_ACTIONS.LOGIN, "users", defaultAdmin.id, {
      username: defaultAdmin.username,
    }).catch(() => {});

    recordLoginSuccess(cleanIdentifier);
    return true;
  }

  if (pin) recordLoginFailure(cleanIdentifier);
  return false;
}
