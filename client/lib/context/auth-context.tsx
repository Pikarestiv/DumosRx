"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { setCurrentUser as setDbUser, logAction } from "@/lib/db/local-database";
import { apiClient } from "@/lib/api/client";
import { getUsersByUsernameOrEmail, createDefaultAdmin, getUserPin, updateUserPin } from "@/lib/db/queries/auth";
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
import { clearPOSCartStorage } from "@/lib/hooks/use-pos-cart";
import { isTauri } from "@/lib/db";
import { setActiveStoreId as setResolvedStoreId } from "@/lib/db/core";
import { getToken } from "@/lib/api/token-manager";
import { mirrorAuthToken } from "@/lib/native/widget-bridge";
import {
  IMPERSONATED_USER_STORAGE_KEY,
  clearImpersonatedSession,
  isImpersonatedSession,
} from "@/lib/utils/impersonation";

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

// The documented default PIN for the zero-users bootstrap admin (see
// login()'s fallback branch below). Requiring the typed PIN match this,
// rather than accepting any 4 digits, means the bootstrap flow can't double
// as a PIN-less login even in the one case it's allowed to fire.
const DEFAULT_ADMIN_PIN = "1234";

// Re-exported from lib/utils/impersonation.ts (the React-free single source
// of truth, so the sync engine, this context and the UI all agree on what an
// impersonated session is) rather than re-declared here.
//
// Separate from "dumos_user": an impersonated profile (see loginFromHandoff)
// must never be restored via the normal mount-effect path below, which also
// calls setDbUser() - that moves the local DB's "current user" pointer to a
// user belonging to another store, corrupting audit-log/performed_by
// attribution for every write made in that session. Writing it under this
// distinct key means the mount effect can restore it into React state ONLY
// (session persists across a reload) without ever routing it through
// setDbUser(). Previously it was written to "dumos_user" itself, so the
// very next reload silently re-hydrated it through the normal path anyway,
// defeating the separation loginFromHandoff's own doc comment describes.
// (declared in lib/utils/impersonation.ts, imported above)

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
  /** True once the mount-time localStorage read has completed, regardless
   * of whether a saved user was found. See its declaration in
   * AuthProvider for why `user !== null` alone can't distinguish
   * "not hydrated yet" from "genuinely logged out". */
  isHydrated: boolean;
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
  /** True while this session came from a superadmin impersonation handoff
   * (see loginFromHandoff). Read by any consumer that must behave
   * differently under impersonation — e.g. SyncIndicator, which disables
   * sync entirely — so nothing has to re-derive it from localStorage on its
   * own. Backed by lib/utils/impersonation.ts's isImpersonatedSession(),
   * the same check the sync engine itself uses. */
  isImpersonating: boolean;
}

export const checkIsAdmin = (role?: string) => {
  if (!role) return false;
  const normalizedRole = role.toLowerCase().replace(/[^a-z_]/g, "");
  // super_admin must stay included: it's the platform's own top role (see
  // checkCanFactoryReset below, which also lists it explicitly), and a
  // prior fix specifically switched pos-transaction-history.tsx's return
  // handling to checkIsAdmin BECAUSE the old exact-match-only check locked
  // super_admin out of processing a return. Losing it here would silently
  // revert that fix.
  return ["admin", "manager", "store_owner", "super_admin"].includes(normalizedRole);
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

/** Whether this user can open the POS header's "Request stock from another
 * store" dialog. Admin-tier roles always can; everyone else needs the
 * store's staff_can_request_transfers setting turned on (off by default -
 * see multi-store-card.tsx). Doesn't check plan tier or store count -
 * callers (pos-layout-header.tsx) combine this with canManageMultiStore and
 * availableStores.length. */
export const checkCanRequestStockTransfer = (
  role: string | undefined,
  staffCanRequestTransfers: number | undefined,
) => {
  if (!checkCanProcessSales(role)) return false;
  return checkIsAdmin(role) || staffCanRequestTransfers === 1;
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

// Gates Factory Reset (Settings > Data): narrower than checkIsAdmin (which
// also passes "manager") - wiping local data and disconnecting cloud sync
// shouldn't be unilateral for anyone but the owner/main admin account.
export const checkCanFactoryReset = (role?: string) =>
  !!role && ["admin", "store_owner", "super_admin"].includes(role.toLowerCase().replace(/[^a-z_]/g, ""));

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isCloudLinked, setIsCloudLinked] = useState(false);
  // Distinguishes "user is null because nobody's logged in" from "user is
  // null because the mount effect below hasn't read localStorage yet" -
  // consumers that need to know a staff member's fixed store_id (see
  // store-context.tsx's hydration-race fix) can't tell those two apart from
  // `user` alone. Flips true once, at the end of the mount effect,
  // regardless of whether a saved user was actually found.
  const [isHydrated, setIsHydrated] = useState(false);
  // Starts false rather than reading localStorage in the initializer: this
  // renders on the server/prerender too, where localStorage doesn't exist,
  // and a value derived from it would mismatch on hydration. The mount
  // effect below sets it, and login/loginFromHandoff/logout keep it current.
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    // Check for saved user in session
    const savedUser = localStorage.getItem("dumos_user");
    const token = localStorage.getItem("auth_token");
    
    setIsCloudLinked(!!token);

    // Backfill: anyone already logged in when the widget feature ships has
    // their token sitting in localStorage with nothing to trigger a mirror
    // into native TokenStore (mirrorAuthToken() otherwise only fires from
    // setToken(), which only runs on a fresh login/silent refresh). Without
    // this, TokenStore.load() stays null on the native side until this
    // device's next login, which may be weeks away, and in the meantime
    // RefreshWorker's no-token branch actively overwrites a good cached
    // widget snapshot with linked:false. Only meaningful under Tauri.
    if (isTauri()) {
      const existingToken = getToken();
      if (existingToken) {
        void mirrorAuthToken(existingToken);
      }
    }

    // Checked BEFORE the normal savedUser branch below: an impersonated
    // session (see loginFromHandoff / IMPERSONATED_USER_STORAGE_KEY's doc
    // comment) restores into React state only, never through setDbUser().
    const savedImpersonatedUser = localStorage.getItem(IMPERSONATED_USER_STORAGE_KEY);
    if (savedImpersonatedUser) {
      try {
        setUser(JSON.parse(savedImpersonatedUser));
      } catch (err) {
        console.error("Failed to parse saved impersonated user, clearing corrupted session", err);
        localStorage.removeItem(IMPERSONATED_USER_STORAGE_KEY);
      }
    } else if (savedUser) {
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

    // Evaluated after the branch above (not inside it) so a session that
    // holds only the impersonator return code — e.g. the profile key was
    // cleared but "End Session" never completed — still reads as
    // impersonated, exactly as the sync engine's own gate sees it.
    setIsImpersonating(isImpersonatedSession());

    setIsHydrated(true);

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
    // Captured before any state changes below: distinguishes the ordinary
    // "same cashier unlocks with their own PIN after auto-lock/idle timeout"
    // flow (lock-screen calls login() directly, without logout() first, and
    // `user` is still the same person who was locked out) from a genuine
    // switch to a DIFFERENT user (lock-screen's "switch account" tile, or a
    // fresh login after logout() already cleared `user` to null). Only the
    // latter should wipe the in-progress POS cart below.
    const previousUserId = user?.id;

    // Only a genuine PIN-based attempt is throttled - login(email) with no
    // pin (the post-cloud-sync auto-login in app/setup/use-onboarding.ts)
    // never guesses a secret, so it's not subject to this at all. Checked
    // BEFORE the DB lookup so a locked-out caller gets instant feedback and
    // can't extend their own lockout just by retrying while still locked.
    if (pin) {
      const lockout = checkLoginLockout(cleanIdentifier);
      if (lockout.locked) {
        throw new Error(
          `Too many failed attempts. Try again in ${formatLockoutRemaining(lockout.remainingMs)}.`,
        );
      }
    }

    let candidates = await getUsersByUsernameOrEmail(cleanIdentifier);
    // Usernames are unique per store, not globally (UNIQUE(store_id,
    // username)) — on a multi-store device, more than one row can share this
    // identifier. Narrow to whichever of them actually match the PIN typed;
    // if a PIN was provided, that's who we're prepared to accept.
    let matches = pin ? candidates.filter((u) => u.pin === pin) : candidates;
    let dbUser = matches[0] ?? null;

    if (dbUser || candidates.length > 0) {
      // If PIN is provided, check it
      if (pin && !dbUser) {
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
          candidates = await getUsersByUsernameOrEmail(cleanIdentifier);
          matches = candidates.filter((u) => u.pin === pin);
          dbUser = matches[0] ?? null;
        }
      }

      // More than one of this device's stores has a user with this exact
      // identifier AND this exact PIN — a genuine collision (plausible with
      // defaults like admin/1234). There is no trustworthy "intended store"
      // to break the tie with here, so this fails closed rather than
      // silently logging the caller in as whichever row SQLite yielded
      // first (which could be a different store's staff member entirely).
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
        if (pin) recordLoginFailure(cleanIdentifier);
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

      // A store-pinned account (staff whose users.store_id is set, as
      // opposed to an owner/admin with access to every store on this device)
      // makes their own store the active store, immediately, as part of
      // authenticating. store-context.tsx already gives `user.store_id`
      // precedence over the switcher state for its own derived
      // activeStoreId/targetId, but that is derived React state only - it
      // never writes the persisted choice. Two things read the persisted
      // value directly instead of going through useStore():
      //
      //  1. lib/api/client.ts's pushChanges()/pullChanges(), which stamp
      //     X-Store-Id straight off localStorage["dumos_active_store_id"].
      //     On an owner's device that had switched to store B, a store-A
      //     cashier logging in would sync (push AND pull) against store B
      //     for their entire session - the one place the derived-state
      //     precedence doesn't reach.
      //  2. store-context.tsx's own lazy initializer on the next mount, so
      //     a stale value also survives into whatever session comes next.
      //
      // Setting the module-scope query resolver here too (rather than
      // leaving it to StoreProvider's targetId effect) closes the window
      // between login() returning and React committing that re-render:
      // child effects - including React Query's own fetch subscriptions -
      // run before the provider's effect, so a query firing in that gap
      // would read the OUTGOING store's id. Same reasoning switchStore()
      // documents for calling setResolvedStoreId() synchronously.
      //
      // Owners/admins (no fixed store_id) are deliberately untouched: their
      // active store is their switcher choice, which store-context.tsx
      // persists on their behalf.
      if (dbUser.store_id) {
        setResolvedStoreId(dbUser.store_id);
        localStorage.setItem("dumos_active_store_id", dbUser.store_id);
      }

      // Covers the "switch user" lock-screen flow (selecting a different
      // recent user and unlocking with their PIN), which calls login()
      // directly without ever going through logout() first. Without this,
      // the outgoing user's cached queries (dashboard, BI, etc.) would keep
      // rendering under the incoming user's session until they went stale.
      // cancelQueries() first since clear() alone doesn't abort a fetch
      // already in flight from the outgoing user.
      //
      // This also fires for the ordinary same-user unlock (lock-screen calls
      // login() there too), which is harmless: clearing cached queries just
      // means they refetch, unlike the POS cart clear below.
      void queryClient.cancelQueries();
      queryClient.clear();
      // Same shared-terminal risk as logout(): the "switch user" path never
      // goes through logout(), so without this the outgoing cashier's
      // in-progress POS cart (and any staged discount/redeemed reward)
      // would carry straight over into the incoming cashier's session.
      //
      // Gated on the login actually being a DIFFERENT user: login() is also
      // how the lock-screen's ordinary "same cashier unlocks with their own
      // PIN after auto-lock/idle timeout" flow re-authenticates. Clearing
      // unconditionally here wiped a cashier's in-progress cart (items,
      // discount, redeemed loyalty reward) every time they simply stepped
      // away and came back - a daily-workflow data-loss regression. Only
      // clear when we can tell this is genuinely a different person than
      // whoever was previously logged in.
      if (previousUserId && previousUserId !== dbUser.id) {
        clearPOSCartStorage();
      }

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
      // Same idea, for the impersonated profile itself: without this, a
      // leftover impersonated session (never properly ended) would win over
      // THIS real login on the very next reload, since the mount effect
      // checks IMPERSONATED_USER_STORAGE_KEY before "dumos_user". Both flags
      // go together (clearImpersonatedSession), which also re-enables sync:
      // the engine refuses to run while either is present.
      clearImpersonatedSession();
      setIsImpersonating(false);

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

      recordLoginSuccess(cleanIdentifier);
      return true;
    }

    // Fallback: bootstrap a default admin, but ONLY on a genuinely fresh
    // device with zero local users - previously this fired for ANY typed PIN
    // whenever "admin" simply didn't match a local row, which a mid-sync or
    // post-deletion device could hit with real users present. Also now
    // requires the PIN match the documented default instead of accepting
    // anything, so this can't double as a PIN-less login.
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
      localStorage.setItem("dumos_user", JSON.stringify(defaultAdmin));
      sessionStorage.setItem("dumos_session_authenticated", "1");
      useAutoLockStore.getState().unlock();
      clearImpersonatedSession();
      setIsImpersonating(false);

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

      recordLoginSuccess(cleanIdentifier);
      return true;
    }

    if (pin) recordLoginFailure(cleanIdentifier);
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
    // Without this, a shared terminal's POS cart (items, discount, redeemed
    // reward, reseller flag — all persisted under this one global key by
    // use-pos-cart.ts's zustand store) survives logout and is inherited by
    // whichever cashier signs in next.
    clearPOSCartStorage();
    // See the matching comment in login(): an impersonated session that
    // ends via the ordinary "Sign Out" button instead of the banner's "End
    // Session" button would otherwise leave these flags behind forever.
    clearImpersonatedSession();
    setIsImpersonating(false);
    // Without this, cached query results (dashboard metrics, BI, etc.) from
    // the outgoing account stay in memory and get served to whichever
    // account logs in next, until their staleTime/gcTime lapses.
    // cancelQueries() first: clear() alone doesn't abort an in-flight
    // fetch, which could otherwise resolve after the next login and
    // repopulate a store/user-unscoped query key.
    void queryClient.cancelQueries();
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

        // A credentialed cloud login is by definition not a superadmin
        // handoff, and it replaces whatever token an impersonated session
        // was carrying. Clearing the impersonation flags here matters
        // because sync() now refuses to run while they're set: the
        // onboarding cloud-restore flow (app/setup/use-onboarding.ts's
        // startSyncProcess) runs immediately after this call and would
        // otherwise be permanently blocked by leftover flags from an
        // impersonated session that was never ended properly.
        clearImpersonatedSession();
        setIsImpersonating(false);


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
        isHydrated,
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
        isImpersonating,
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
