import { create } from "zustand";
import { persist } from "zustand/middleware";
import { webApiClient } from "@/lib/api/client";

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
}

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
          const user = await webApiClient.request<any>("user");
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
