import { create } from "zustand";
import { persist } from "zustand/middleware";
import { webApiClient } from "@/lib/api/client";

interface AdminState {
  summary: any | null;
  pharmacies: any[] | null;
  pharmacyMeta: any | null;
  products: any[] | null;
  productMeta: any | null;
  productMetrics: any | null;
  productCategories: string[] | null;
  users: any[] | null;
  userMeta: any | null;
  systemHealth: any | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  latency: number;

  fetchSummary: (force?: boolean) => Promise<void>;
  fetchPharmacies: (page?: number, search?: string) => Promise<void>;
  fetchProducts: (page?: number, search?: string, category?: string) => Promise<void>;
  standardizeProducts: () => Promise<any>;
  fetchUsers: (page?: number, search?: string) => Promise<void>;
  fetchHealth: () => Promise<void>;
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      summary: null,
      pharmacies: null,
      pharmacyMeta: null,
      products: null,
      productMeta: null,
      productMetrics: null,
      productCategories: null,
      users: null,
      userMeta: null,
      systemHealth: null,
      loading: false,
      error: null,
      lastFetched: null,
      latency: 0,

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
          const response = await webApiClient.request<any>("admin/summary");
          const endTime = performance.now();
          set({
            summary: response,
            loading: false,
            lastFetched: Date.now(),
            latency: Math.round(endTime - startTime),
            error: null,
          });
        } catch (err: any) {
          set({
            error: err.message || "Failed to fetch admin summary",
            loading: false,
          });
        }
      },

      fetchPharmacies: async (page = 1, search = "") => {
        set({ loading: true, error: null });

        try {
          const query = `admin/pharmacies?page=${page}${search ? `&search=${search}` : ""}`;
          const response = await webApiClient.request<any>(query);
          set({
            pharmacies: response.data,
            pharmacyMeta: response.meta,
            loading: false,
            error: null,
          });
        } catch (err: any) {
          set({
            error: err.message || "Failed to fetch pharmacies",
            loading: false,
          });
        }
      },

      fetchProducts: async (page = 1, search = "", category = "") => {
        set({ loading: true, error: null });

        try {
          const query = `admin/products?page=${page}${search ? `&search=${search}` : ""}${category ? `&category=${category}` : ""}`;
          const response = await webApiClient.request<any>(query);
          set({
            products: response.products.data,
            productMeta: response.products.meta,
            productMetrics: response.metrics,
            productCategories: response.categories,
            loading: false,
            error: null,
          });
        } catch (err: any) {
          set({
            error: err.message || "Failed to fetch products",
            loading: false,
          });
        }
      },

      standardizeProducts: async () => {
        set({ loading: true, error: null });
        try {
          const response = await webApiClient.request<any>("admin/products/standardize", { method: "POST" });
          set({ loading: false });
          return response;
        } catch (err: any) {
          set({ error: err.message || "Failed to standardize products", loading: false });
          throw err;
        }
      },

      fetchHealth: async () => {
        set({ loading: true, error: null });
        try {
          const response = await webApiClient.request<any>("admin/health");
          set({ systemHealth: response, loading: false });
        } catch (err: any) {
          set({ error: err.message || "Failed to fetch system health", loading: false });
        }
      },

      fetchUsers: async (page = 1, search = "") => {
        set({ loading: true, error: null });

        try {
          const query = `admin/users?page=${page}${search ? `&search=${search}` : ""}`;
          const response = await webApiClient.request<any>(query);
          set({
            users: response.data,
            userMeta: response.meta,
            loading: false,
            error: null,
          });
        } catch (err: any) {
          set({
            error: err.message || "Failed to fetch users",
            loading: false,
          });
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
