import { create } from "zustand";

interface SystemConfigState {
  subscriptionPlans: any | null;
  setSubscriptionPlans: (plans: any) => void;
  isLoadedFromDB: boolean;
  setLoadedFromDB: (status: boolean) => void;
}

export const useSystemConfigStore = create<SystemConfigState>((set) => ({
  subscriptionPlans: null,
  setSubscriptionPlans: (plans) => set({ subscriptionPlans: plans }),
  isLoadedFromDB: false,
  setLoadedFromDB: (status) => set({ isLoadedFromDB: status }),
}));
