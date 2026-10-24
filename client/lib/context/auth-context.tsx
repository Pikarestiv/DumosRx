"use client";

import type { RecentUser } from "@/lib/types/user";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import * as Sentry from "@sentry/nextjs";
import { setCurrentUser as setDbUser, logAction } from "@/lib/db/local-database";
import { endAdminTillSession } from "@/lib/api/admin-till-session";
import { endTillInspectionSession, getTillInspectionSession } from "@/lib/utils/till-inspection";
import { useCloudLink, type CloudLinkResult } from "@/lib/hooks/use-cloud-link";
import { getUserPin, updateUserPin, migrateLegacyPinToHash } from "@/lib/db/queries/auth";
import { pinMatches, needsPinRehash } from "@/lib/utils/pin-hash";
import { ensurePermissionGroupsSeeded, getUserPermissionGroup } from "@/lib/db/queries/permission-groups";
import { hasPermission } from "@/lib/hooks/use-permissions";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import { queryClient } from "@/lib/query-client";
import { clearLocalDrafts } from "@/lib/utils/clear-local-drafts";
import { IMPERSONATED_USER_STORAGE_KEY, clearImpersonatedSession } from "@/lib/utils/impersonation";
import { APP_EVENTS, onAppEvent } from "@/lib/events";
import { clearStoredUser } from "@/lib/storage-keys";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { performLogin } from "@/lib/context/auth-login";
import { readSavedSession, applySavedSessionSideEffects } from "@/lib/context/auth-session-restore";

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
  linkCloudAccount: (email: string, password: string) => Promise<CloudLinkResult>;
  linkWithRelinkCode: (code: string) => Promise<CloudLinkResult>;
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
  const hydrated = useHydrated();
  const [savedSession] = useState(readSavedSession);
  const [sessionUser, setUser] = useState<User | null>(savedSession.user);
  const [cloudLinked, setIsCloudLinked] = useState(savedSession.isCloudLinked);
  const [impersonating, setIsImpersonating] = useState(savedSession.isImpersonating);
  const [inspecting, setIsInspecting] = useState(savedSession.isInspecting);
  // Distinguishes "user is null because nobody's logged in" from "user is null because the saved session isn't exposed yet" - co…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L183
  const isHydrated = hydrated;
  // Hidden until hydrated, so the first client render matches the prerendered HTML:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L190
  const user = hydrated ? sessionUser : null;
  const isCloudLinked = hydrated && cloudLinked;
  const isImpersonating = hydrated && impersonating;
  const isInspecting = hydrated && inspecting;

  useEffect(() => {
    applySavedSessionSideEffects(savedSession);

    const unsubscribeTokenSet = onAppEvent(APP_EVENTS.authTokenSet, () =>
      setIsCloudLinked(true),
    );
    const unsubscribeTokenCleared = onAppEvent(APP_EVENTS.authTokenCleared, () =>
      setIsCloudLinked(false),
    );

    return () => {
      unsubscribeTokenSet();
      unsubscribeTokenCleared();
    };
  }, [savedSession]);

  const login = useCallback(
    // Captured before any state changes below:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L269
    (identifier: string, pin?: string) =>
      performLogin(identifier, pin, user?.id, {
        setUser,
        setIsInspecting,
        setIsImpersonating,
      }),
    [user],
  );

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

  const { linkCloudAccount, linkWithRelinkCode } = useCloudLink({
    user,
    setUser,
    setIsCloudLinked,
    setIsImpersonating,
  });

  // Seeds the active store's 5 default permission groups (idempotent, see ensurePermissionGroupsSeeded) the moment a session is established - co…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L789
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    void ensurePermissionGroupsSeeded().catch(() => {});
  }, [userId]);

  const [permissionGroup, setPermissionGroup] = useState<{ userId: string; id: string; permissions: string[] } | null>(null);
  const [permissionGroupUserId, setPermissionGroupUserId] = useState(userId);
  if (permissionGroupUserId !== userId) {
    setPermissionGroupUserId(userId);
    // A user-to-user switch (the lock screen's "switch account", which never goes through logout()) must not leave the outgoing user's group in st…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L805
    setPermissionGroup((previous) => (previous?.userId === userId ? previous : null));
  }
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = () => {
      getUserPermissionGroup(userId).then((g) => {
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
  }, [userId]);

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
      linkWithRelinkCode,
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
      linkWithRelinkCode,
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
