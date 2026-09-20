import { create } from "zustand";
import { persist } from "zustand/middleware";
import { webApiClient } from "@/lib/api/client";
import { queryClient } from "@/lib/query-client";
import { setAdminToken } from "@/lib/api/admin-token";
import { useAdminStore } from "@/lib/store/use-admin-store";

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  email_verified_at?: string | null;
  require_email_verification?: boolean;
}

/** Store-level admin/manager/etc. have zero access to the platform admin
 * dashboard (web/app/admin/*) regardless of how permissive their store-level
 * role is. Single source of truth instead of raw `role !== 'super_admin'`
 * literals across layout/login files. Kept narrow (super_admin only) for
 * actions that are genuinely super_admin-exclusive: suspending/deactivating
 * other platform accounts, creating new platform accounts. */
export const checkIsSuperAdmin = (role?: string) => role === "super_admin";

/** The three platform-level roles (no store of their own) that can reach
 * *some* part of the admin dashboard. super_admin sees everything, while
 * platform_admin/agent see a narrower nav scoped to their own permissions
 * (create_accounts / grant_trials), enforced server-side per endpoint. This
 * only gates whether the dashboard shell loads at all. */
export const checkCanAccessAdmin = (role?: string) =>
  role === "super_admin" || role === "platform_admin" || role === "agent";

interface AdminAuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  /** True only once the server has confirmed this session during *this* page
   * load - via login, initSession()'s refresh call, or the handoff exchange.
   * `user` alone can't stand in for it: `user` is persisted to localStorage
   * (see partialize below) and is therefore editable by whoever sits at the
   * browser. Never persisted, so a reload always has to re-verify. */
  sessionVerified: boolean;

  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  fetchUser: () => Promise<void>;
  /** Re-establishes a session after a page reload via the HttpOnly refresh
   * cookie, since the access token itself lives in memory only and doesn't
   * survive one. Replaces fetchUser() as the "am I logged in" check on
   * mount - it's a single request instead of a doomed /user call cascading
   * into a /refresh attempt. */
  initSession: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null, // Access token: memory-only, never persisted (see partialize below)
      loading: false,
      sessionVerified: false,

      setUser: (user) => set({ user }),
      setToken: (token) => {
        // We still keep the token in memory for the current session. Holding
        // one is exactly what "verified" means here: it can only have come
        // from a login response, initSession(), the 401 refresh path or the
        // handoff exchange - never from client-editable storage.
        set({ token, sessionVerified: !!token });
        // Mirrored into a plain, import-free module so base-client.ts/
        // logger.ts can read it without statically importing this store,
        // which would create a cycle (base-client -> this store ->
        // client.ts -> base-client) and break client.ts's module init.
        setAdminToken(token);
      },

      fetchUser: async () => {
        set({ loading: true });
        try {
          const user = await webApiClient.request<User>("user");
          set({ user, loading: false });
        } catch (_error) {
          set({ user: null, token: null, loading: false, sessionVerified: false });
          setAdminToken(null);
        }
      },

      initSession: async () => {
        set({ loading: true });
        try {
          const data = await webApiClient.request<{ token: string; user: User }>(
            "admin/session/refresh",
            { method: "POST" },
          );
          set({ token: data.token, user: data.user, loading: false, sessionVerified: true });
          setAdminToken(data.token);
        } catch (_error) {
          set({ user: null, token: null, loading: false, sessionVerified: false });
          setAdminToken(null);
        }
      },

      logout: async () => {
        // Revoke server-side FIRST, and await it. Clearing local state is what
        // re-arms app/admin/layout.tsx's session-init effect, and that effect
        // posts to /admin/session/refresh - if it beat the logout request to
        // the server, the still-valid refresh cookie would hand the session
        // straight back and the admin would stay signed in after Sign Out.
        // Awaiting first also means the logout request still carries the
        // access token, which the old ordering had already cleared.
        try {
          await webApiClient.request("/logout", { method: "POST" });
        } catch (_error) {
          // Expired token, offline, server error: nothing more to do
          // server-side, but the local session must still be torn down.
        }
        set({ user: null, token: null, sessionVerified: false });
        setAdminToken(null);
        // Without this, cached admin/platform query data from the outgoing
        // session stays in memory and gets served to whoever logs in next.
        void queryClient.cancelQueries();
        queryClient.clear();
        // Same reason, for the other half of the cache: `admin-storage`
        // persists the platform summary (revenue stats, recent store names,
        // owner emails) to localStorage, so it has to be wiped on logout too
        // or it survives into the next session on a shared machine.
        useAdminStore.getState().reset();
      },
    }),
    {
      name: "admin-auth-storage",
      partialize: (state) => ({ user: state.user }), // Don't persist token in localStorage
    }
  )
);
