import { create } from "zustand";
import type { SubscriptionPlansConfig } from "@/lib/types/subscription-plans";

interface SystemConfigState {
  subscriptionPlans: SubscriptionPlansConfig | null;
  setSubscriptionPlans: (plans: SubscriptionPlansConfig) => void;
  isLoadedFromDB: boolean;
  setLoadedFromDB: (status: boolean) => void;
}

export const useSystemConfigStore = create<SystemConfigState>((set) => ({
  subscriptionPlans: null,
  setSubscriptionPlans: (plans) => set({ subscriptionPlans: plans }),
  isLoadedFromDB: false,
  setLoadedFromDB: (status) => set({ isLoadedFromDB: status }),
}));
