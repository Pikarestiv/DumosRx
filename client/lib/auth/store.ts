import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { authApi } from "@/lib/api/auth";
import type { User as ApiUser } from "@/lib/api/common";

// Application User Interface (CamelCase)
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  phone?: string;
  isActive: boolean;
  lastLogin?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
}

// Helper to map API user to App user
const mapUser = (apiUser: ApiUser): User => ({
  id: apiUser.id,
  email: apiUser.email,
  firstName: apiUser.first_name,
  lastName: apiUser.last_name,
  role: apiUser.role,
  phone: apiUser.phone,
  isActive: apiUser.is_active,
  lastLogin: apiUser.last_login_at,
});

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token:
        typeof window !== "undefined"
          ? localStorage.getItem("auth_token")
          : null,
      isLoading: true,
      isAuthenticated: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await authApi.login({
            email,
            password,
            device_name: "web",
          });

          const user = mapUser(response.user);
          set({
            user,
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
          });

          // Also set in localStorage for axios interceptor if needed elsewhere outside store
          if (typeof window !== "undefined") {
            localStorage.setItem("auth_token", response.token);
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          // Attempt server logout, but don't block local cleanup if it fails
          await authApi.logout().catch(console.error);
        } finally {
          if (typeof window !== "undefined") {
            localStorage.removeItem("auth_token");
          }
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      checkAuth: async () => {
        set({ isLoading: true });
        try {
          const token =
            get().token ||
            (typeof window !== "undefined"
              ? localStorage.getItem("auth_token")
              : null);

          if (!token) {
            set({ isLoading: false, isAuthenticated: false, user: null });
            return;
          }

          // Verify token and get fresh profile
          const apiUser = await authApi.getUser();
          const user = mapUser(apiUser);

          set({
            user,
            token, // key might persist but local var might be null
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          console.error("Auth check failed:", error);
          if (typeof window !== "undefined") {
            localStorage.removeItem("auth_token");
          }
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => {
        if (typeof window !== "undefined") {
          if (token) {
            localStorage.setItem("auth_token", token);
          } else {
            localStorage.removeItem("auth_token");
          }
        }
        set({ token, isAuthenticated: !!token });
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") {
          return localStorage;
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({ user: state.user }), // Don't persist token here, it's in auth_token
    },
  ),
);
