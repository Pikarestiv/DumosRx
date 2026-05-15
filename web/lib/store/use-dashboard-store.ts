import { create } from "zustand";
import { persist } from "zustand/middleware";
import { webApiClient } from "@/lib/api/client";

interface DashboardState {
  data: any;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  
  fetchData: (force?: boolean) => Promise<void>;
  resetData: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      data: null,
      loading: false,
      error: null,
      lastFetched: null,

      fetchData: async (force = false) => {
        const { data, lastFetched, loading } = get();
        
        // Cache for 5 minutes unless forced
        if (!force && data && lastFetched && Date.now() - lastFetched < 300000) {
          return;
        }

        if (loading) return;

        set({ loading: true, error: null });
        
        try {
          const [summary, staff] = await Promise.all([
            webApiClient.getDashboardSummary(),
            webApiClient.getStaff().catch(() => []),
          ]);

          set({ 
            data: {
              ...summary,
              staff: staff.length > 0 ? staff : summary.staff || [],
            }, 
            loading: false, 
            lastFetched: Date.now(),
            error: null 
          });
        } catch (err: any) {
          console.error("Dashboard store fetch error:", err);
          set({ 
            loading: false, 
            error: err.message || "Failed to fetch dashboard data" 
          });
        }
      },

      resetData: () => {
        set({ data: null, lastFetched: null, error: null });
      }
    }),
    {
      name: "dumosrx-dashboard-storage",
      partialize: (state) => ({ data: state.data, lastFetched: state.lastFetched }),
    }
  )
);
