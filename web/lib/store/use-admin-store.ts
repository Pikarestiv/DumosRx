import { create } from "zustand";
import { persist } from "zustand/middleware";
import { webApiClient } from "@/lib/api/client";

interface AdminState {
  summary: unknown | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  latency: number;

  fetchSummary: (force?: boolean) => Promise<void>;
  standardizeProducts: () => Promise<unknown>;
  setLatency: (ms: number) => void;
  /** Wipes the in-memory state *and* the persisted `admin-storage` copy of
   * it. Called from useAdminAuthStore.logout(): `summary` holds platform-wide
   * data (revenue, recent store names, owner emails) and would otherwise
   * survive a logout on a shared machine. */
  reset: () => void;
}

const INITIAL_STATE = {
  summary: null,
  loading: false,
  error: null,
  lastFetched: null,
  latency: 0,
};

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      fetchSummary: async (force = false) => {
        const { summary, lastFetched, loading } = get();

        // Cache for 5 minutes unless forced
        if (!force && summary && lastFetched && Date.now() - lastFetched < 300000) {
          return;
        }

        if (loading) return;

        set({ loading: true, error: null });
        const startTime = performance.now();

        try {
          const response = await webApiClient.request<unknown>("admin/summary");
          const endTime = performance.now();
          set({
            summary: response,
            loading: false,
            lastFetched: Date.now(),
            latency: Math.round(endTime - startTime),
            error: null,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Failed to fetch admin summary",
            loading: false,
          });
        }
      },

      standardizeProducts: async () => {
        set({ loading: true, error: null });
        try {
          const response = await webApiClient.request<unknown>("admin/products/standardize", { method: "POST" });
          set({ loading: false });
          return response;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Failed to standardize products",
            loading: false,
          });
          throw err;
        }
      },

      // Real round-trip timing, written by whichever admin request measured it
      // (see useAdminSummary), so the header's "Cloud API: Nms" badge reflects
      // an actual measurement instead of a permanent 0.
      setLatency: (ms) => set({ latency: ms }),

      reset: () => {
        set({ ...INITIAL_STATE });
        if (typeof window !== "undefined") {
          localStorage.removeItem("admin-storage");
        }
      },
    }),
    {
      name: "admin-storage",
      partialize: (state) => ({
        summary: state.summary,
        lastFetched: state.lastFetched
      }),
    }
  )
);
