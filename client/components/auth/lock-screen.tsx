"use client";

import { useState, useEffect, useCallback } from "react";
import { RecentUser } from "@/lib/context/auth-context";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/context/auth-context";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { checkLoginLockout } from "@/lib/utils/login-lockout";

const VERIFY_FEEDBACK_MS = 75;

function lockoutEndFor(user: RecentUser | null): number | null {
  if (!user) return null;
  const status = checkLoginLockout(user.username);
  return status.locked ? Date.now() + status.remainingMs : null;
}

import { UserSelection } from "./user-selection";
import { PinEntry } from "./pin-entry";

interface LockScreenProps {
  recentUsers: RecentUser[];
  onRemoveRecentUser?: (id: string) => void;
  onLoginAsOther: () => void;
  onSetUpNewDevice?: () => void;
  onUnlockSuccess?: () => void;
  defaultUser?: RecentUser | null;
}

export function LockScreen({
  recentUsers,
  onRemoveRecentUser,
  onLoginAsOther,
  onSetUpNewDevice,
  onUnlockSuccess,
  defaultUser,
}: LockScreenProps) {
  const [selectedUser, setSelectedUser] = useState<RecentUser | null>(
    defaultUser || null,
  );
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  // Absolute timestamp (ms) the current lockout (if any) ends at, for `selectedUser`.
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-lock-screen-tsx-L39
  const [lockedUntil, setLockedUntil] = useState<number | null>(() =>
    lockoutEndFor(defaultUser || null),
  );
  const [now, setNow] = useState(() => Date.now());
  const { login } = useAuth();
  const router = useRouter();

  // Reflects any lockout already in effect the moment a user tile is selected (not just after they go on to fail 5 more time…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-lock-screen-tsx-L48
  const selectUser = (user: RecentUser | null) => {
    setSelectedUser(user);
    setLockedUntil(lockoutEndFor(user));
    setNow(Date.now());
  };

  // Live countdown: re-checks once a second so the displayed time (and the disabled state) updates on its own, and clears it…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-lock-screen-tsx-L62
  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick >= lockedUntil) {
        setLockedUntil(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const lockoutRemainingMs =
    lockedUntil !== null ? Math.max(0, lockedUntil - now) : null;

  // Re-checks login-lockout.ts's actual state for selectedUser and applies it to `lockedUntil` if locked.
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-lock-screen-tsx-L79
  const applyLockoutIfActive = useCallback(() => {
    if (!selectedUser) return false;
    const status = checkLoginLockout(selectedUser.username);
    if (status.locked) {
      const checkedAt = Date.now();
      setNow(checkedAt);
      setLockedUntil(checkedAt + status.remainingMs);
      return true;
    }
    return false;
  }, [selectedUser]);

  // Separated from the form's submit handler so it can also be triggered directly once the 4th digit is entered (auto-submit…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-lock-screen-tsx-L95
  const attemptLogin = async (pinValue: string) => {
    if (!selectedUser || isLoading || lockoutRemainingMs) return;

    setIsLoading(true);
    // Yields so the 4th digit and "Verifying..." paint before login()'s
    // bcrypt compare blocks the thread, and holds them long enough to read.
    await new Promise((resolve) => setTimeout(resolve, VERIFY_FEEDBACK_MS));
    try {
      const success = await login(selectedUser.username, pinValue);
      if (success) {
        toast.success(`Welcome back, ${selectedUser.first_name}!`);
        if (onUnlockSuccess) {
          onUnlockSuccess();
          setIsLoading(false);
        } else {
          router.push("/dashboard");
        }
      } else {
        setPin("");
        setHasError(true);
        setTimeout(() => setHasError(false), 500);
        // Recompute AFTER the failed attempt: this might be the 5th failure
        // that actually triggers the lockout, in which case the countdown
        // (not just a toast) should show immediately.
        if (!applyLockoutIfActive()) {
          toast.error("Invalid PIN. Please try again.");
        }
        setIsLoading(false);
      }
    } catch (err) {
      // A thrown error here is login-lockout.ts's own lockout rejection
      // (checked before the PIN comparison) - show it as the persistent
      // countdown in PinEntry, not just a toast that disappears in a few
      // seconds and leaves no visible reason the Unlock button won't work.
      if (applyLockoutIfActive()) {
        setPin("");
        setIsLoading(false);
        return;
      }
      // Surface the real failure (network timeout during first-launch sync,
      // DB not initialized, ...) instead of the old hardcoded "Database
      // might not be initialized", which misdiagnosed every other cause.
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Login failed. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    void attemptLogin(pin);
  };

  return (
    <div className="flex-1 flex flex-col w-full">
      <AnimatePresence mode="wait">
        {!!!selectedUser && (
          <UserSelection
            key="grid"
            recentUsers={recentUsers}
            onSelectUser={selectUser}
            onRemoveUser={onRemoveRecentUser}
            onLoginAsOther={onLoginAsOther}
            onSetUpNewDevice={onSetUpNewDevice}
          />
        )}
        {!!selectedUser && (
          <PinEntry
            key="pin"
            selectedUser={selectedUser}
            pin={pin}
            setPin={setPin}
            isLoading={isLoading}
            hasError={hasError}
            lockoutRemainingMs={lockoutRemainingMs}
            handleLogin={handleLogin}
            onAutoSubmit={(p) => void attemptLogin(p)}
            onBack={() => {
              selectUser(null);
              setPin("");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
