import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AutoLockState {
  duration: number; // in minutes. 0 = off
  isLocked: boolean;
  lastActivity: number;
  setDuration: (duration: number) => void;
  lock: () => void;
  unlock: () => void;
  updateActivity: () => void;
}

export const useAutoLockStore = create<AutoLockState>()(
  persist(
    (set) => ({
      duration: 0,
      isLocked: false,
      lastActivity: Date.now(),
      setDuration: (duration: number) => set({ duration }),
      lock: () => set({ isLocked: true }),
      unlock: () => set({ isLocked: false, lastActivity: Date.now() }),
      updateActivity: () => set({ lastActivity: Date.now() }),
    }),
    {
      name: "dumos_autolock",
      storage: createJSONStorage(() => localStorage),
      // We want to persist the duration, the locked state, and the lastActivity timestamp to survive page reloads
      partialize: (state) => ({ 
        duration: state.duration, 
        isLocked: state.isLocked,
        lastActivity: state.lastActivity 
      }),
    }
  )
);
