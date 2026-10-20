import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect, useRef } from "react";
import { useFeatureGate } from "./use-feature-gate";
import { getUserAutoLockDuration } from "@/lib/db/queries/auth";
import { getRecentUsers, getStoredUser } from "@/lib/storage-keys";

interface AutoLockState {
  duration: number; // in minutes. 0 = off
  isLocked: boolean;
  lastActivity: number;
  // True while the lock overlay should show account selection (ignoring the current user) rather than defaulting straight to that user's PIN ent…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-auto-lock-ts-L12
  forceAccountSelection: boolean;
  setDuration: (duration: number) => void;
  lock: () => void;
  lockForSwitch: () => void;
  unlock: () => void;
  updateActivity: () => void;
}

// zustand's persist middleware writes this tab's entire state to localStorage synchronously on every set().
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-auto-lock-ts-L25
const ACTIVITY_WRITE_THROTTLE_MS = 5000;

export const useAutoLockStore = create<AutoLockState>()(
  persist(
    (set, get) => ({
      duration: 5,
      isLocked: false,
      lastActivity: Date.now(),
      forceAccountSelection: false,
      setDuration: (duration: number) => set({ duration }),
      lock: () => set({ isLocked: true }),
      lockForSwitch: () => set({ isLocked: true, forceAccountSelection: true }),
      unlock: () =>
        set({
          isLocked: false,
          lastActivity: Date.now(),
          forceAccountSelection: false,
        }),
      updateActivity: () => {
        const now = Date.now();
        if (now - get().lastActivity < ACTIVITY_WRITE_THROTTLE_MS) return;
        set({ lastActivity: now });
      },
    }),
    {
      name: "dumos_autolock",
      storage: createJSONStorage(() => localStorage),
      // We want to persist the duration, the locked state, and the lastActivity timestamp to survive page reloads
      partialize: (state) => ({
        duration: state.duration,
        isLocked: state.isLocked,
        lastActivity: state.lastActivity,
      }),
    },
  ),
);

// persist's `set()` always writes this tab's *entire* in-memory state back to localStorage, not just the changed field.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-auto-lock-ts-L69
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "dumos_autolock") {
      void useAutoLockStore.persist.rehydrate();
    }
  });
}

export function useAutoLockTimer() {
  // Selectors, not a destructured whole-store call:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-auto-lock-ts-L86
  const duration = useAutoLockStore((s) => s.duration);
  const lock = useAutoLockStore((s) => s.lock);
  const updateActivity = useAutoLockStore((s) => s.updateActivity);
  const { canAutoLock } = useFeatureGate();

  useEffect(() => {
    if (duration <= 0 || !canAutoLock) return; // auto lock is off or not available on this plan

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
  }, [duration, canAutoLock, updateActivity, lock]);
}

// Makes the auto-lock duration follow the ACCOUNT rather than just this browser/device:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-auto-lock-L135
export function useSyncAutoLockDurationWithAccount(userId: string | undefined) {
  const setDuration = useAutoLockStore((s) => s.setDuration);
  const syncedForUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!userId || syncedForUserId.current === userId) return;
    let cancelled = false;

    (async () => {
      try {
        const stored = await getUserAutoLockDuration(userId);
        if (!cancelled && stored !== null && stored !== undefined) {
          setDuration(stored);
        }
      } catch (e) {
        console.error("Failed to load account auto-lock duration", e);
      } finally {
        if (!cancelled) syncedForUserId.current = userId;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, setDuration]);
}

// Ctrl+L (Cmd+L on Mac) manually locks the app on demand:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-auto-lock-ts-L164
export function useLockShortcut() {
  const lock = useAutoLockStore((s) => s.lock);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key?.toLowerCase() === "l" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        lock();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lock]);
}

// Forces the lock screen whenever the app is freshly landed on with an existing saved account:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-auto-lock-L197
export function useLockOnFreshLoad() {
  const lock = useAutoLockStore((s) => s.lock);
  const lockForSwitch = useAutoLockStore((s) => s.lockForSwitch);

  useEffect(() => {
    try {
      if (
        getStoredUser() &&
        !sessionStorage.getItem("dumos_session_authenticated")
      ) {
        const recentUsers = getRecentUsers();
        if (recentUsers.length > 1) {
          lockForSwitch();
        } else {
          lock();
        }
      }
    } catch {
      // localStorage/sessionStorage unavailable (e.g. private mode)
    }
    // Deliberately runs once per DashboardLayout mount, not gated to a single
    // module-lifetime flag; see comment above for why.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
