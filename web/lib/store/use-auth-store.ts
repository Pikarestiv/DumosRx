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

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  fetchUser: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: typeof window !== "undefined" ? localStorage.getItem("drx_token") : null,
      loading: false,

      setUser: (user) => set({ user }),
      setToken: (token) => {
        if (token) {
          localStorage.setItem("drx_token", token);
        } else {
          localStorage.removeItem("drx_token");
        }
        set({ token });
      },

      fetchUser: async () => {
        set({ loading: true });
        try {
          const user = await webApiClient.request<any>("user");
          set({ user, loading: false });
        } catch (error) {
          set({ user: null, loading: false });
          localStorage.removeItem("drx_token");
        }
      },

      logout: () => {
        localStorage.removeItem("drx_token");
        set({ user: null, token: null });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);
