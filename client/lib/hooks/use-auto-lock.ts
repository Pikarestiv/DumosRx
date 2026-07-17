import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect } from "react";

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

export function useAutoLockTimer() {
  const { duration, isLocked, lock, updateActivity } = useAutoLockStore();

  useEffect(() => {
    if (duration <= 0) return; // auto lock is off

    const handleActivity = () => updateActivity();

    // Attach listeners
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity);
    window.addEventListener("scroll", handleActivity);

    const interval = setInterval(() => {
      const {
        lastActivity,
        isLocked: currentLocked,
        duration: currentDuration,
      } = useAutoLockStore.getState();
      
      if (!currentLocked && currentDuration > 0) {
        const inactiveTime = Date.now() - lastActivity;
        if (inactiveTime > currentDuration * 60 * 1000) {
          lock();
        }
      }
    }, 10000); // Check every 10 seconds

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      clearInterval(interval);
    };
  }, [duration, updateActivity, lock]);
}
