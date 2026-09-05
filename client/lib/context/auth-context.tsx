"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { setCurrentUser as setDbUser, logAction } from "@/lib/db/local-database";
import { apiClient } from "@/lib/api/client";
import { getUserByUsernameOrEmail, createDefaultAdmin, getUserPin, updateUserPin } from "@/lib/db/queries/auth";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import { sync, isSyncing } from "@/lib/db/sync-engine";
import { queryClient } from "@/lib/query-client";

// Polls until any in-flight sync finishes, so a caller that just triggered
// (or piggybacked on) a sync can safely read fresh local data afterward.
// isSyncing() flips false the instant the in-flight sync's finally block
// runs, so this only ever waits out the current run; it never itself starts one.
async function waitForSyncToFinish(timeoutMs = 8000, pollMs = 150) {
  const deadline = Date.now() + timeoutMs;
  while (isSyncing() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

// Throttles the PIN-mismatch recovery sync below (module-scope, not per
// component instance, since a locked screen can remount). Without this, a
// user mashing a genuinely wrong PIN would fire a network sync on every
// single attempt.
let lastPinRecoverySyncAt = 0;
const PIN_RECOVERY_SYNC_COOLDOWN_MS = 10_000;

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email?: string;
  role: "super_admin" | "store_owner" | "admin" | "manager" | "specialist" | "sales_staff" | "auditor";
  store_id?: string;
}

export interface RecentUser {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  role: string;
  last_login: string;
}

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
  login: (username: string, pin?: string) => Promise<boolean>;
  /** Establishes a local session directly from a cross-origin handoff
   * (impersonation / dashboard → app), bypassing PIN entry. See the
   * implementation for why it deliberately does less than login(). */
  loginFromHandoff: (apiUser: HandoffApiUser) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  canManageStockBatch: boolean;
  canProcessSales: boolean;
  canViewAllActivity: boolean;
  changePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; message: string }>;
  verifyPin: (pin: string) => Promise<boolean>;
  linkCloudAccount: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  isCloudLinked: boolean;
}

export const checkIsAdmin = (role?: string) => {
  if (!role) return false;
  const normalizedRole = role.toLowerCase().replace(/[^a-z]/g, "");
  return normalizedRole.includes("admin") || normalizedRole.includes("manager") || normalizedRole.includes("storeowner");
};

export const checkCanManageStockBatch = (role?: string) => {
  if (!role) return false;
  const normalizedRole = role.toLowerCase().replace(/[^a-z_]/g, "");
  return ["admin", "manager", "specialist", "store_owner"].includes(normalizedRole);
};

export const checkCanProcessSales = (role?: string) => {
  if (!role) return false;
  const normalizedRole = role.toLowerCase().replace(/[^a-z_]/g, "");
  return ["admin", "manager", "specialist", "sales_staff", "store_owner"].includes(normalizedRole);
};

/** Activity/history views (audit logs, stock movements, sales, expenses,
 * purchase orders, stock audits, prescriptions, returns) are scoped to the
 * viewer's own actions unless they're a store owner or admin; everyone
 * else (manager, specialist, sales_staff, auditor) only sees what they
 * themselves performed. */
export const checkCanViewAllActivity = (role?: string) => {
  if (!role) return false;
  const normalizedRole = role.toLowerCase().replace(/[^a-z_]/g, "");
  return ["admin", "store_owner"].includes(normalizedRole);
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isCloudLinked, setIsCloudLinked] = useState(false);

  useEffect(() => {
    // Check for saved user in session
    const savedUser = localStorage.getItem("dumos_user");
    const token = localStorage.getItem("auth_token");
    
    setIsCloudLinked(!!token);

    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setDbUser(parsedUser);
      } catch (err) {
        // Corrupted/partial write (e.g. interrupted by a connection drop
        // mid-save). Without this, the throw aborts the rest of this
        // effect silently, leaving `user` stuck null forever and the
        // token-event listeners below never attached. Clear the bad value
        // so the next reload doesn't repeat the same failure, and let the
        // caller's own !user handling (redirect to /login) take it from here.
        console.error("Failed to parse saved user, clearing corrupted session", err);
        localStorage.removeItem("dumos_user");
      }
    }

    const handleTokenSet = () => setIsCloudLinked(true);
    const handleTokenCleared = () => setIsCloudLinked(false);

    window.addEventListener("auth_token_set", handleTokenSet);
    window.addEventListener("auth_token_cleared", handleTokenCleared);

    return () => {
      window.removeEventListener("auth_token_set", handleTokenSet);
      window.removeEventListener("auth_token_cleared", handleTokenCleared);
    };
  }, []);

  const login = async (identifier: string, pin?: string) => {
    // For local-first, we check both username and email
    const cleanIdentifier = identifier.trim();
    let dbUser = await getUserByUsernameOrEmail(cleanIdentifier);

    if (dbUser) {
      // If PIN is provided, check it
      if (pin && dbUser.pin !== pin) {
        // A PIN reset via the web dashboard writes straight to the cloud
        // DB; this device only sees it once it next syncs down, which
        // could otherwise be minutes away. Rather than make a locked-out
        // owner know to reload the app, pull once on a mismatch (throttled,
        // and only when there's a cloud link to pull from) and recheck
        // before actually failing the login.
        const now = Date.now();
        const hasCloudLink =
          typeof window !== "undefined" && !!localStorage.getItem("auth_token");
        if (
          hasCloudLink &&
          navigator.onLine &&
          now - lastPinRecoverySyncAt > PIN_RECOVERY_SYNC_COOLDOWN_MS
        ) {
          lastPinRecoverySyncAt = now;
          const result = await sync().catch(() => null);
          // If a background/setup sync was already in flight, our call above
          // was a no-op; the pull we're relying on may still be running.
          // Wait for it instead of rechecking against data it hasn't written yet.
          if (result?.error === "Sync already in progress") {
            await waitForSyncToFinish();
          }
          dbUser = await getUserByUsernameOrEmail(cleanIdentifier);
        }
      }

      if (!dbUser || (pin && dbUser.pin !== pin)) {
        // The acting user_id on this row will be whoever was previously
        // logged in on this device (or null), not the failed identifier:
        // audit_logs attributes actions to the current session, and there
        // isn't one yet at this point. record_id + details.username still
        // identify which account the attempt was against. Falls back to the
        // typed identifier itself in the (practically unreachable) case
        // where the recovery sync above made the user row disappear.
        logAction(AUDIT_ACTIONS.LOGIN_FAILED, "users", dbUser?.id || cleanIdentifier, {
          username: cleanIdentifier,
          reason: "invalid_pin",
        }).catch(() => {});
        return false;
      }

      const userProfile: User = {
        id: dbUser.id,
        first_name: dbUser.first_name || "",
        last_name: dbUser.last_name || "",
        username: dbUser.username || "",
        role: dbUser.role as User["role"],
        store_id: dbUser.store_id,
      };

      // Covers the "switch user" lock-screen flow (selecting a different
      // recent user and unlocking with their PIN), which calls login()
      // directly without ever going through logout() first. Without this,
      // the outgoing user's cached queries (dashboard, BI, etc.) would keep
      // rendering under the incoming user's session until they went stale.
      // cancelQueries() first since clear() alone doesn't abort a fetch
      // already in flight from the outgoing user.
      queryClient.cancelQueries();
      queryClient.clear();

      setUser(userProfile);
      setDbUser(userProfile);
      Sentry.setUser({ id: userProfile.id, username: userProfile.username, role: userProfile.role });
      localStorage.setItem("dumos_user", JSON.stringify(userProfile));
      // Marks this tab as already having gone through a real auth/unlock this
      // session. DashboardLayout's fresh-load lock check reads this so it
      // doesn't immediately re-lock right after a login/unlock that just
      // succeeded. Cleared on logout; sessionStorage itself clears on tab
      // close, so a genuinely new tab/session still locks correctly.
      sessionStorage.setItem("dumos_session_authenticated", "1");
      // Any successful login means "not locked", full stop, regardless of
      // which screen triggered it. Without this, a stale isLocked=true left
      // over from an earlier auto-lock timeout (persisted in localStorage)
      // would survive a fresh login untouched and immediately re-show the
      // dashboard's lock overlay right after login just succeeded.
      useAutoLockStore.getState().unlock();
      // Same idea for a stale impersonation banner: the return-code flag
      // (see ImpersonationBanner) is only ever meant to mean "this exact
      // session came from a superadmin handoff." It's written once by
      // app/auth/callback/page.tsx and only ever cleared by successfully
      // clicking "End Session" — a normal logout, a crash, or simply
      // closing the impersonated tab all leave it behind in localStorage
      // forever. Without this, ANY ordinary PIN login on that same device
      // afterward — by anyone, not just the original impersonator — shows
      // a permanent, undismissable "Impersonation Mode" banner.
      localStorage.removeItem("impersonator_handoff_return_code");

      // Update recent users list
      const recentUsersStr = localStorage.getItem("dumos_recent_users");
      let recentUsers: RecentUser[] = recentUsersStr ? JSON.parse(recentUsersStr) : [];
      
      const recentUser: RecentUser = {
        id: userProfile.id,
        first_name: userProfile.first_name,
        last_name: userProfile.last_name,
        username: userProfile.username,
        role: userProfile.role,
        last_login: new Date().toISOString(),
      };

      // Dedupe by username, not id: if this device's local DB was ever
      // rebuilt/restored, the same real-world person can come back with a
      // brand new user id but the same username, and login() itself matches
      // by username anyway. Deduping by id alone left stale ghost tiles for
      // the old id permanently stuck in this cache, showing as duplicate
      // "accounts" on the lock screen that were really all the same person.
      recentUsers = recentUsers.filter(
        (u) => u.username.toLowerCase() !== recentUser.username.toLowerCase(),
      );
      recentUsers.unshift(recentUser);
      if (recentUsers.length > 5) recentUsers = recentUsers.slice(0, 5); // Keep last 5

      localStorage.setItem("dumos_recent_users", JSON.stringify(recentUsers));

      logAction(AUDIT_ACTIONS.LOGIN, "users", userProfile.id, {
        username: userProfile.username,
      }).catch(() => {});

      return true;
    }

    // Fallback: If no users exist, create a default admin
    if (cleanIdentifier.toLowerCase() === "admin") {
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
          pin: "1234",
          role: defaultAdmin.role
        });
      } catch (e) {
        console.error("Failed to persist default admin", e);
      }

      setUser(defaultAdmin);
      setDbUser(defaultAdmin);
      localStorage.setItem("dumos_user", JSON.stringify(defaultAdmin));
      sessionStorage.setItem("dumos_session_authenticated", "1");
      useAutoLockStore.getState().unlock();
      localStorage.removeItem("impersonator_handoff_return_code");

      // Update recent users list for default admin
      const recentUsersStr = localStorage.getItem("dumos_recent_users");
      let recentUsers: RecentUser[] = recentUsersStr ? JSON.parse(recentUsersStr) : [];
      
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

      localStorage.setItem("dumos_recent_users", JSON.stringify(recentUsers));

      logAction(AUDIT_ACTIONS.LOGIN, "users", defaultAdmin.id, {
        username: defaultAdmin.username,
      }).catch(() => {});

      return true;
    }

    return false;
  };

  /** Bootstraps a local session for a user who authenticated on the cloud side
   * and arrived here via the one-time handoff code (/auth/callback); most
   * importantly the impersonated store user, who has no account (and no PIN)
   * in this device's local SQLite DB at all.
   *
   * Deliberately does only the *session-establishing* half of login(): it does
   * NOT call setDbUser() (that moves the local DB's "current user" pointer,
   * which is the wrong DB context for a user belonging to another store), does
   * NOT touch dumos_recent_users (would pollute this device's lock-screen
   * account tiles with foreign-store staff), and does NOT logAction() (would
   * write into the wrong store's local audit trail (the impersonation itself
   * is already audited server-side by AdminService::impersonateStore). */
  const loginFromHandoff = (apiUser: HandoffApiUser) => {
    const userProfile: User = {
      id: apiUser.id,
      first_name: apiUser.first_name || "",
      last_name: apiUser.last_name || "",
      username: apiUser.username || "",
      email: apiUser.email,
      role: apiUser.role as User["role"],
      store_id: apiUser.store_id,
    };

    // Same reasoning as login(): whoever was on this device before must not
    // have their cached queries served to the incoming session. cancelQueries()
    // first since clear() alone doesn't abort an in-flight fetch.
    queryClient.cancelQueries();
    queryClient.clear();

    setUser(userProfile);
    Sentry.setUser({ id: userProfile.id, username: userProfile.username, role: userProfile.role });
    localStorage.setItem("dumos_user", JSON.stringify(userProfile));
    sessionStorage.setItem("dumos_session_authenticated", "1");
    useAutoLockStore.getState().unlock();
  };

  const logout = () => {
    // Captured before clearing: logAction attributes to the current
    // session's user, which is about to be cleared.
    if (user) {
      logAction(AUDIT_ACTIONS.LOGOUT, "users", user.id, {
        username: user.username,
      }).catch(() => {});
    }
    setUser(null);
    setDbUser(null);
    Sentry.setUser(null);
    localStorage.removeItem("dumos_user");
    sessionStorage.removeItem("dumos_session_authenticated");
    // See the matching comment in login(): an impersonated session that
    // ends via the ordinary "Sign Out" button instead of the banner's "End
    // Session" button would otherwise leave this flag behind forever.
    localStorage.removeItem("impersonator_handoff_return_code");
    // Without this, cached query results (dashboard metrics, BI, etc.) from
    // the outgoing account stay in memory and get served to whichever
    // account logs in next, until their staleTime/gcTime lapses.
    // cancelQueries() first: clear() alone doesn't abort an in-flight
    // fetch, which could otherwise resolve after the next login and
    // repopulate a store/user-unscoped query key.
    queryClient.cancelQueries();
    queryClient.clear();
  };

  const changePin = async (currentPin: string, newPin: string) => {
    if (!user) return { success: false, message: "Not authenticated" };

    const currentStoredPin = await getUserPin(user.id);
    if (!currentStoredPin) return { success: false, message: "User not found" };

    if (currentStoredPin !== currentPin) {
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
  };

  const verifyPin = async (pin: string) => {
    if (!user) return false;
    const storedPin = await getUserPin(user.id);
    if (storedPin) {
      return storedPin === pin;
    }
    return false;
  };

  const linkCloudAccount = async (email: string, password: string) => {
    try {
      // Prevent linking to a different account if already linked before
      if (user?.email && user.email.toLowerCase() !== email.toLowerCase()) {
        return { 
          success: false, 
          message: `Account mismatch. This device is already linked to ${user.email}. Please use that account.` 
        };
      }

      const response = await apiClient.login(email, password);
      
      if (response.token) {
        apiClient.setToken(response.token);
        setIsCloudLinked(true);
        
        // Update local user info if already logged in locally
        if (user) {
          const updatedUser = { ...user, email };
          setUser(updatedUser);
          localStorage.setItem("dumos_user", JSON.stringify(updatedUser));
        }

        return { success: true, message: "Cloud account linked successfully!" };
      }
      return { success: false, message: "Invalid credentials" };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : "Failed to connect to cloud" };
    }
  };

  const isAdmin = user ? checkIsAdmin(user.role) : false;
  const canManageStockBatch = user ? checkCanManageStockBatch(user.role) : false;
  const canProcessSales = user ? checkCanProcessSales(user.role) : false;
  const canViewAllActivity = user ? checkCanViewAllActivity(user.role) : false;

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        loginFromHandoff,
        logout,
        isAuthenticated: !!user,
        isAdmin,
        canManageStockBatch,
        canProcessSales,
        canViewAllActivity,
        changePin,
        verifyPin,
        linkCloudAccount,
        isCloudLinked,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
