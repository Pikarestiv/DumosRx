import { create } from "zustand";
import { persist } from "zustand/middleware";
import { webApiClient } from "@/lib/api/client";

interface User {
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
 * actions that are genuinely super_admin-exclusive — suspending/deactivating
 * other platform accounts, creating new platform accounts. */
export const checkIsSuperAdmin = (role?: string) => role === "super_admin";

/** The three platform-level roles (no store of their own) that can reach
 * *some* part of the admin dashboard — super_admin sees everything, while
 * platform_admin/agent see a narrower nav scoped to their own permissions
 * (create_accounts / grant_trials), enforced server-side per endpoint. This
 * only gates whether the dashboard shell loads at all. */
export const checkCanAccessAdmin = (role?: string) =>
  role === "super_admin" || role === "platform_admin" || role === "agent";

interface AdminAuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  fetchUser: () => Promise<void>;
  logout: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null, // Token is handled by HttpOnly cookie
      loading: false,

      setUser: (user) => set({ user }),
      setToken: (token) => {
        // We still keep the token in memory for the current session
        set({ token });
      },

      fetchUser: async () => {
        set({ loading: true });
        try {
          const user = await webApiClient.request<User>("user");
          set({ user, loading: false });
        } catch (_error) {
          set({ user: null, token: null, loading: false });
        }
      },

      logout: () => {
        set({ user: null, token: null });
        // The backend should clear the cookie on its logout route
        webApiClient.request("/logout", { method: "POST" });
      },
    }),
    {
      name: "admin-auth-storage",
      partialize: (state) => ({ user: state.user }), // Don't persist token in localStorage
    }
  )
);
