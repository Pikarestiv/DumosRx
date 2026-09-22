import { create } from "zustand";
import { persist } from "zustand/middleware";
import { webApiClient } from "@/lib/api/client";
import { queryClient } from "@/lib/query-client";

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  email_verified_at?: string | null;
  require_email_verification?: boolean;
}

/**
 * NOTE: this store deliberately holds NO token. It used to mirror the
 * `drx_token` localStorage key into a persisted `token` field (a second
 * copy of the same live api.dumosrx.com bearer credential, under the
 * "auth-storage" key), but nothing ever read it - its only consumers,
 * lib/api/query-scope.ts and components/smartsupp-widget.tsx, read `.user`.
 * Since web/'s own dashboard was removed, no surface on this origin makes an
 * authenticated non-admin request at all, so storing a token here was pure
 * XSS-readable exposure. Admin auth is entirely separate and in-memory
 * (use-admin-auth-store.ts).
 */
interface AuthState {
  user: User | null;
  loading: boolean;

  setUser: (user: User | null) => void;
  fetchUser: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: false,

      setUser: (user) => set({ user }),

      fetchUser: async () => {
        set({ loading: true });
        try {
          const user = await webApiClient.request<User>("user");
          set({ user, loading: false });
        } catch (_error) {
          set({ user: null, loading: false });
        }
      },

      logout: () => {
        set({ user: null });
        // Without this, cached dashboard/query data from the outgoing
        // account stays in memory and gets served to whichever account
        // logs in next, until its staleTime lapses. cancelQueries() first:
        // clear() alone doesn't abort in-flight fetches, and a request
        // issued under this account could otherwise resolve after the next
        // account logs in and repopulate a bare (unscoped) query key.
        void queryClient.cancelQueries();
        queryClient.clear();
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }),
    }
  )
);
