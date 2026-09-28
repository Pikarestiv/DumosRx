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

// zustand's persist middleware writes this tab's entire state to localStorage
// synchronously on every set(). updateActivity() is wired to mousemove/
// touchstart/scroll (see useAutoLockTimer below), so without throttling it
// forces a blocking localStorage write on every single touch and scroll
// frame - widening the touchstart-to-click timing window that can drop a tap
// on iPad. A lock timer only needs second-ish resolution, not the write on
// every event.
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

// persist's `set()` always writes this tab's *entire* in-memory state back
// to localStorage, not just the changed field. Without this listener, a
// second tab/window left open from before a Settings change (still holding
// the old `duration` in memory) would silently clobber it back on that
// tab's next `updateActivity()` call (i.e. its next mousemove/keydown/etc) —
// this is what was causing auto-lock to "reset to 5 minutes" after being
// turned off. Rehydrating on the storage event keeps every open tab's
// in-memory state caught up with whichever tab wrote most recently.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "dumos_autolock") {
      void useAutoLockStore.persist.rehydrate();
    }
  });
}

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
 * Makes the auto-lock duration follow the ACCOUNT rather than just this
 * browser/device: whenever the authenticated user changes (fresh device,
 * or a shared terminal switching between staff), pulls that user's stored
 * `users.auto_lock_duration` and overwrites the local zustand/localStorage
 * value with it. Without this, a device that's never seen this account
 * before would silently keep whatever duration the PREVIOUS account (or the
 * store's own default of 5) left behind, rather than what this staff
 * member actually chose in Settings.
 *
 * One-way (DB -> local) on account change; the other direction (local edit
 * -> DB) is handled by security-settings.tsx calling
 * updateUserAutoLockDuration() directly when the user changes the Select.
 */
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
