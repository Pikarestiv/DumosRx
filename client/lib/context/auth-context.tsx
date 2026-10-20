"use client";

import type { RecentUser } from "@/lib/types/user";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import * as Sentry from "@sentry/nextjs";
import { setCurrentUser as setDbUser, logAction } from "@/lib/db/local-database";
import {
  shouldAttemptAdminTillLogin,
  requestAdminTillSession,
  endAdminTillSession,
  TILL_CODE_LENGTH,
  UNIFORM_REJECTION,
  OFFLINE_MESSAGE,
} from "@/lib/api/admin-till-session";
import {
  startTillInspectionSession,
  endTillInspectionSession,
  getTillInspectionSession,
  isTillInspectionSession,
} from "@/lib/utils/till-inspection";
import { apiClient } from "@/lib/api/client";
import { withNetworkRetry } from "@/lib/api/retry-on-network-error";
import {
  getUsersByUsernameOrEmail,
  createDefaultAdmin,
  getUserPin,
  updateUserPin,
  migrateLegacyPinToHash,
} from "@/lib/db/queries/auth";
import { pinMatches, needsPinRehash } from "@/lib/utils/pin-hash";
import { getTotalUserCount } from "@/lib/db/queries/setup";
import { ensurePermissionGroupsSeeded, getUserPermissionGroup } from "@/lib/db/queries/permission-groups";
import { hasPermission } from "@/lib/hooks/use-permissions";
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
import { isTauri } from "@/lib/db";
import { setActiveStoreId as setResolvedStoreId } from "@/lib/db/core";
import { getToken } from "@/lib/api/token-manager";
import { mirrorAuthToken } from "@/lib/native/widget-bridge";
import {
  IMPERSONATED_USER_STORAGE_KEY,
  clearImpersonatedSession,
  isImpersonatedSession,
} from "@/lib/utils/impersonation";
import { APP_EVENTS, onAppEvent } from "@/lib/events";
import {
  STORAGE_KEYS,
  getAuthToken,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  getRecentUsers,
  setRecentUsers,
  setStoredActiveStoreId,
} from "@/lib/storage-keys";

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

// Re-exported from lib/utils/impersonation.ts (the React-free single source of truth, so the sync engine, this context and the UI all agree on…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L91

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email?: string;
  role: "super_admin" | "store_owner" | "admin" | "manager" | "specialist" | "sales_staff" | "auditor";
  store_id?: string;
}

export type { RecentUser };

/** The user payload the cloud handoff endpoint returns (a raw App\Models\User
 * row plus its appended `name` accessor); only the fields we map are listed. */
export interface HandoffApiUser {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email?: string;
  role: string;
  store_id?: string;
}

interface AuthContextType {
  user: User | null;
  // True once the mount-time localStorage read has completed, regardless of whether a saved user was found.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-auth-context-tsx-L133
  isHydrated: boolean;
  login: (username: string, pin?: string) => Promise<boolean>;
  // Establishes a local session directly from a cross-origin handoff (impersonation / dashboard → app), bypassing PIN entry.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-auth-context-tsx-L139
  loginFromHandoff: (apiUser: HandoffApiUser) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  canManageStockBatch: boolean;
  canProcessSales: boolean;
  canViewAllActivity: boolean;
  // The acting session's resolved permission group, or null when they have none yet (pre-sync gap, or a store_owner/super_admin, who are never g…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-auth-context-tsx-L149
  permissionGroup: { userId: string; id: string; permissions: string[] } | null;
  changePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; message: string }>;
  verifyPin: (pin: string) => Promise<boolean>;
  linkCloudAccount: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  isCloudLinked: boolean;
  // True while this session came from a superadmin impersonation handoff (see loginFromHandoff).
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-auth-context-tsx-L160
  isImpersonating: boolean;
  isInspecting: boolean;
}

// Plain role-tier utility, NOT a permission gate - kept only for the two call sites that inspect a role belonging to someone OTHER than the ac…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#context-auth-context-tsx-L170
export const checkIsAdmin = (role?: string) => {
  if (!role) return false;
  const normalizedRole = role.toLowerCase().replace(/[^a-z_]/g, "");
  // super_admin must stay included:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L164
  return ["admin", "manager", "store_owner", "super_admin"].includes(normalizedRole);
};

// Plain role-tier utility, NOT a permission gate - kept only for cloud-danger-zone.tsx, whose `role` comes from the cloud-authenticated dashbo…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#context-auth-context-tsx-L189
export const checkCanFactoryReset = (role?: string) =>
  !!role && ["admin", "store_owner", "super_admin"].includes(role.toLowerCase().replace(/[^a-z_]/g, ""));

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isCloudLinked, setIsCloudLinked] = useState(false);
  // Distinguishes "user is null because nobody's logged in" from "user is null because the mount effect below hasn't read localStorage yet" - co…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L183
  const [isHydrated, setIsHydrated] = useState(false);
  // Starts false rather than reading localStorage in the initializer:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L190
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);

  useEffect(() => {
    // Check for saved user in session
    const savedUser = getStoredUser();
    const token = getAuthToken();
    
    setIsCloudLinked(!!token);

    // Backfill: anyone already logged in when the widget feature ships has their token sitting in localStorage with nothing to trigger a mirror in…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L204
    if (isTauri()) {
      const existingToken = getToken();
      if (existingToken) {
        void mirrorAuthToken(existingToken);
      }
    }

    // Checked BEFORE the normal savedUser branch below:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L219
    const savedImpersonatedUser = localStorage.getItem(IMPERSONATED_USER_STORAGE_KEY);
    if (savedImpersonatedUser) {
      try {
        setUser(JSON.parse(savedImpersonatedUser));
      } catch (err) {
        console.error("Failed to parse saved impersonated user, clearing corrupted session", err);
        localStorage.removeItem(IMPERSONATED_USER_STORAGE_KEY);
      }
    } else if (savedUser) {
      const parsedUser = savedUser as unknown as User;
      setUser(parsedUser);
      setDbUser(parsedUser);
    } else if (localStorage.getItem(STORAGE_KEYS.user)) {
      // Corrupted/partial write (e.g.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L235
      console.error("Clearing a corrupted saved user session");
      clearStoredUser();
    }

    // Evaluated after the branch above (not inside it) so a session that holds only the impersonator return code — e.g.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L242
    setIsImpersonating(isImpersonatedSession());
    setIsInspecting(isTillInspectionSession());

    setIsHydrated(true);

    const handleTokenSet = () => setIsCloudLinked(true);
    const handleTokenCleared = () => setIsCloudLinked(false);

    const unsubscribeTokenSet = onAppEvent(APP_EVENTS.authTokenSet, handleTokenSet);
    const unsubscribeTokenCleared = onAppEvent(
      APP_EVENTS.authTokenCleared,
      handleTokenCleared,
    );

    return () => {
      unsubscribeTokenSet();
      unsubscribeTokenCleared();
    };
  }, []);

  const login = useCallback(async (identifier: string, pin?: string) => {
    // For local-first, we check both username and email
    const cleanIdentifier = identifier.trim();
    // Captured before any state changes below:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L269
    const previousUserId = user?.id;

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
      setIsInspecting(true);
      setIsImpersonating(false);

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

      setUser(userProfile);
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
      setIsImpersonating(false);

      // Update recent users list
      let recentUsers: RecentUser[] = getRecentUsers();
      
      const recentUser: RecentUser = {
        id: userProfile.id,
        first_name: userProfile.first_name,
        last_name: userProfile.last_name,
        username: userProfile.username,
        role: userProfile.role,
        last_login: new Date().toISOString(),
      };

      // Dedupe by username, not id:
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L537
      recentUsers = recentUsers.filter(
        (u) => u.username.toLowerCase() !== recentUser.username.toLowerCase(),
      );
      recentUsers.unshift(recentUser);
      if (recentUsers.length > 5) recentUsers = recentUsers.slice(0, 5); // Keep last 5

      setRecentUsers(recentUsers);

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

      setUser(defaultAdmin);
      setDbUser(defaultAdmin);
      setStoredUser(defaultAdmin);
      sessionStorage.setItem("dumos_session_authenticated", "1");
      useAutoLockStore.getState().unlock();
      clearImpersonatedSession();
      setIsImpersonating(false);

      // Update recent users list for default admin
      let recentUsers: RecentUser[] = getRecentUsers();
      
      const recentUser: RecentUser = {
        id: defaultAdmin.id,
        first_name: defaultAdmin.first_name,
        last_name: defaultAdmin.last_name,
        username: defaultAdmin.username,
        role: defaultAdmin.role,
        last_login: new Date().toISOString(),
      };

      recentUsers = recentUsers.filter(
        (u) => u.username.toLowerCase() !== recentUser.username.toLowerCase(),
      );
      recentUsers.unshift(recentUser);
      if (recentUsers.length > 5) recentUsers = recentUsers.slice(0, 5); // Keep last 5

      setRecentUsers(recentUsers);

      logAction(AUDIT_ACTIONS.LOGIN, "users", defaultAdmin.id, {
        username: defaultAdmin.username,
      }).catch(() => {});

      recordLoginSuccess(cleanIdentifier);
      return true;
    }

    if (pin) recordLoginFailure(cleanIdentifier);
    return false;
  }, [user]);

  // Bootstraps a local session for a user who authenticated on the cloud side and arrived here via the one-time handoff code (/auth/callback); m…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-auth-context-tsx-L659
  const loginFromHandoff = useCallback((apiUser: HandoffApiUser) => {
    const userProfile: User = {
      id: apiUser.id,
      first_name: apiUser.first_name || "",
      last_name: apiUser.last_name || "",
      username: apiUser.username || "",
      email: apiUser.email,
      role: apiUser.role as User["role"],
      store_id: apiUser.store_id,
    };

    // Same reasoning as login():
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L650
    void queryClient.cancelQueries();
    queryClient.clear();

    setUser(userProfile);
    Sentry.setUser({ id: userProfile.id, username: userProfile.username, role: userProfile.role });
    // NOT "dumos_user" - see IMPERSONATED_USER_STORAGE_KEY's doc comment.
    localStorage.setItem(IMPERSONATED_USER_STORAGE_KEY, JSON.stringify(userProfile));
    // Set immediately (not left to the next mount) so consumers like
    // SyncIndicator disable sync for this session without needing a reload.
    setIsImpersonating(true);
    sessionStorage.setItem("dumos_session_authenticated", "1");
    useAutoLockStore.getState().unlock();
  }, []);

  const logout = useCallback(() => {
    // Captured before clearing: logAction attributes to the current
    // session's user, which is about to be cleared.
    if (user) {
      logAction(AUDIT_ACTIONS.LOGOUT, "users", user.id, {
        username: user.username,
      }).catch(() => {});
    }
    setUser(null);
    // Fire-and-forget so the server closes the row and records a duration; without this any logout mid-inspection left an open session with no exi…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L676
    const inspection = getTillInspectionSession();
    if (inspection) {
      void endAdminTillSession(inspection.sessionId, "signed_out");
    }
    endTillInspectionSession();
    setIsInspecting(false);
    setDbUser(null);
    Sentry.setUser(null);
    clearStoredUser();
    sessionStorage.removeItem("dumos_session_authenticated");
    // Without this, a shared terminal's POS cart (items, discount, redeemed reward, reseller flag — all persisted under this one global key by use…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L689
    clearLocalDrafts();
    // See the matching comment in login():
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L694
    clearImpersonatedSession();
    setIsImpersonating(false);
    // Without this, cached query results (dashboard metrics, BI, etc.) from the outgoing account stay in memory and get served to whichever accoun…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L699
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [user]);

  const changePin = useCallback(async (currentPin: string, newPin: string) => {
    if (!user) return { success: false, message: "Not authenticated" };

    const currentStoredPin = await getUserPin(user.id);
    if (!currentStoredPin) return { success: false, message: "User not found" };

    if (!pinMatches(currentPin, currentStoredPin)) {
      return { success: false, message: "Current PIN is incorrect" };
    }

    try {
      await updateUserPin(user.id, newPin);
      await logAction(AUDIT_ACTIONS.PIN_CHANGED, "users", user.id, {
        username: user.username,
      });
      return { success: true, message: "PIN updated successfully" };
    } catch (e) {
      console.error("Failed to update PIN", e);
      return { success: false, message: "Database error" };
    }
  }, [user]);

  const verifyPin = useCallback(async (pin: string) => {
    if (!user) return false;
    const storedPin = await getUserPin(user.id);
    if (!storedPin) return false;

    if (!pinMatches(pin, storedPin)) return false;

    // Same lazy migration as login(): any successful verification of a
    // legacy plaintext PIN is a chance to upgrade it in place.
    if (needsPinRehash(storedPin)) {
      void migrateLegacyPinToHash(user.id, pin);
    }
    return true;
  }, [user]);

  const linkCloudAccount = useCallback(async (email: string, password: string) => {
    try {
      // Prevent linking to a different account if already linked before
      if (user?.email && user.email.toLowerCase() !== email.toLowerCase()) {
        return { 
          success: false, 
          message: `Account mismatch. This device is already linked to ${user.email}. Please use that account.` 
        };
      }

      const response = await withNetworkRetry(() => apiClient.login(email, password));

      if (response.token) {
        apiClient.setToken(response.token);
        setIsCloudLinked(true);

        // A credentialed cloud login is by definition not a superadmin handoff, and it replaces whatever token an impersonated session was carrying.
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L762
        clearImpersonatedSession();
        setIsImpersonating(false);


        // Update local user info if already logged in locally
        if (user) {
          const updatedUser = { ...user, email };
          setUser(updatedUser);
          setStoredUser(updatedUser);
        }

        return { success: true, message: "Cloud account linked successfully!" };
      }
      return { success: false, message: "Invalid credentials" };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : "Failed to connect to cloud" };
    }
  }, [user]);

  // Seeds the active store's 5 default permission groups (idempotent, see ensurePermissionGroupsSeeded) the moment a session is established - co…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L789
  useEffect(() => {
    if (!user) return;
    void ensurePermissionGroupsSeeded().catch(() => {});
  }, [user?.id]);

  const [permissionGroup, setPermissionGroup] = useState<{ userId: string; id: string; permissions: string[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setPermissionGroup(null);
      return;
    }
    // A user-to-user switch (the lock screen's "switch account", which never goes through logout()) must not leave the outgoing user's group in st…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L805
    setPermissionGroup((previous) => (previous?.userId === user.id ? previous : null));
    const load = () => {
      getUserPermissionGroup(user.id).then((g) => {
        if (!cancelled) setPermissionGroup(g);
      }).catch(() => {});
    };
    load();
    // A pull can bring down a permission_groups edit made from another device (or another admin) affecting this user's own group - without this, t…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L815
    const unsubscribeSyncCompleted = onAppEvent(APP_EVENTS.syncCompleted, load);
    return () => {
      cancelled = true;
      unsubscribeSyncCompleted();
    };
  }, [user?.id]);

  // Deliberate, spec-sanctioned change from the deleted checkIsAdmin/ checkCanManageStockBatch/checkCanViewAllActivity helpers, which never list…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L826
  const isAdmin = hasPermission(user, permissionGroup, "manage_staff");
  const canManageStockBatch = hasPermission(user, permissionGroup, "manage_products");
  const canProcessSales = hasPermission(user, permissionGroup, "process_sales");
  const canViewAllActivity = hasPermission(user, permissionGroup, "view_activity_log");

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isHydrated,
      login,
      loginFromHandoff,
      logout,
      isAuthenticated: !!user,
      isAdmin,
      canManageStockBatch,
      canProcessSales,
      canViewAllActivity,
      permissionGroup,
      changePin,
      verifyPin,
      linkCloudAccount,
      isCloudLinked,
      isImpersonating,
      isInspecting,
    }),
    [
      user,
      isHydrated,
      login,
      loginFromHandoff,
      logout,
      isAdmin,
      canManageStockBatch,
      canProcessSales,
      canViewAllActivity,
      permissionGroup,
      changePin,
      verifyPin,
      linkCloudAccount,
      isCloudLinked,
      isImpersonating,
      isInspecting,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
