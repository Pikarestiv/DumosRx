import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect } from "react";
import { useFeatureGate } from "./use-feature-gate";

interface AutoLockState {
  duration: number; // in minutes. 0 = off
  isLocked: boolean;
  lastActivity: number;
  // True while the lock overlay should show account selection (ignoring the
  // current user) rather than defaulting straight to that user's PIN entry;
  // set by "Switch Account" so it can reuse this same overlay instead of a
  // separate page. Deliberately not persisted (see partialize below); it only
  // ever needs to survive within the current live session.
  forceAccountSelection: boolean;
  setDuration: (duration: number) => void;
  lock: () => void;
  lockForSwitch: () => void;
  unlock: () => void;
  updateActivity: () => void;
}

export const useAutoLockStore = create<AutoLockState>()(
  persist(
    (set) => ({
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
      updateActivity: () => set({ lastActivity: Date.now() }),
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

export function useAutoLockTimer() {
  // Selectors, not a destructured whole-store call: this hook runs inside
  // DashboardLayout, which wraps the entire app, so subscribing to the whole
  // store would re-render everything below it on every touchstart/mousemove/
  // scroll (since those all call updateActivity(), touching lastActivity).
  // On iPad specifically that re-render can land between a tap's touchstart
  // and its (delayed) synthetic click, dropping the click and requiring a
  // second tap to register: this is what was causing the widespread
  // "buttons need double-tapping" reports.
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

/**
 * Ctrl+L (Cmd+L on Mac) manually locks the app on demand: deliberately not
 * Win+L, which is the OS's own lock-the-whole-machine shortcut on Windows and
 * can't be (and shouldn't be) intercepted by a single app.
 */
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

/**
 * Forces the lock screen whenever the app is freshly landed on with an
 * existing saved account: otherwise a device that was left unlocked (isLocked
 * persisted as false) would open straight into the dashboard for anyone who
 * picks it up, with no PIN check at all. "Login as someone else" on the lock
 * screen remains the escape hatch if it's not the account they want.
 *
 * Gated on sessionStorage's "dumos_session_authenticated" marker (set by
 * auth-context's login(), cleared on logout) rather than a plain in-memory
 * flag: a plain flag would re-fire this on every page reload, including a
 * harmless refresh by someone already actively using the app, and critically
 * it would also fire the instant DashboardLayout first mounts right after a
 * fresh /login success, forcing an immediate, redundant second PIN entry.
 * sessionStorage persists across reloads within the same tab but clears when
 * the tab actually closes, so a genuinely new tab/session still locks.
 *
 * When more than one recent account exists on this device (shared terminal),
 * a fresh landing shows account SELECTION rather than defaulting straight to
 * the last-used user's PIN entry: otherwise a different staff member picking
 * up the device would have no way to reach their own account without first
 * unlocking as whoever used it last.
 */
export function useLockOnFreshLoad() {
  const lock = useAutoLockStore((s) => s.lock);
  const lockForSwitch = useAutoLockStore((s) => s.lockForSwitch);

  useEffect(() => {
    try {
      if (
        localStorage.getItem("dumos_user") &&
        !sessionStorage.getItem("dumos_session_authenticated")
      ) {
        const recentUsersStr = localStorage.getItem("dumos_recent_users");
        const recentUsers = recentUsersStr ? JSON.parse(recentUsersStr) : [];
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
