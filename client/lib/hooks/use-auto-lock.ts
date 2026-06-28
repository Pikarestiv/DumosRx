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
      // We only want to persist the duration, not the locked state or lastActivity
      partialize: (state) => ({ duration: state.duration }),
    }
  )
);
