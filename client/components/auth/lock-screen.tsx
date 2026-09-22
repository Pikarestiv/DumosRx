"use client";

import { useState, useEffect, useCallback } from "react";
import { RecentUser } from "@/lib/context/auth-context";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/context/auth-context";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { checkLoginLockout } from "@/lib/utils/login-lockout";

import { UserSelection } from "./user-selection";
import { PinEntry } from "./pin-entry";

interface LockScreenProps {
  recentUsers: RecentUser[];
  onLoginAsOther: () => void;
  onSetUpNewDevice?: () => void;
  onUnlockSuccess?: () => void;
  defaultUser?: RecentUser | null;
}

export function LockScreen({
  recentUsers,
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
  // Absolute timestamp (ms) the current lockout (if any) ends at, for
  // `selectedUser`. Null means not locked. Kept as a timestamp (not a
  // ticking "remaining ms" value directly) so the 1s interval below is the
  // only place recomputing "how much longer" - this alone doesn't need to
  // change when the interval fires unless the lockout actually clears.
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  // Reflects any lockout already in effect the moment a user tile is
  // selected (not just after they go on to fail 5 more times right here) -
  // login-lockout.ts's state persists across screens/reloads, so a user
  // who was locked out earlier and comes back to this same tile should see
  // the countdown immediately, before typing anything.
  useEffect(() => {
    if (!selectedUser) {
      setLockedUntil(null);
      return;
    }
    const status = checkLoginLockout(selectedUser.username);
    setLockedUntil(status.locked ? Date.now() + status.remainingMs : null);
  }, [selectedUser]);

  // Live countdown: re-checks once a second so the displayed time (and the
  // disabled state) updates on its own, and clears itself the instant the
  // lockout genuinely expires rather than requiring another failed attempt
  // to notice.
  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      if (Date.now() >= lockedUntil) {
        setLockedUntil(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const lockoutRemainingMs =
    lockedUntil !== null ? Math.max(0, lockedUntil - Date.now()) : null;

  // Re-checks login-lockout.ts's actual state for selectedUser and applies
  // it to `lockedUntil` if locked. Called both after a failed PIN attempt
  // (which might be the exact failure that just triggered a fresh lockout)
  // and after a thrown lockout error (an attempt that arrived already
  // locked) - either way, this is the single place `lockedUntil` gets set
  // from a real check rather than assumed.
  const applyLockoutIfActive = useCallback(() => {
    if (!selectedUser) return false;
    const status = checkLoginLockout(selectedUser.username);
    if (status.locked) {
      setLockedUntil(Date.now() + status.remainingMs);
      return true;
    }
    return false;
  }, [selectedUser]);

  // Separated from the form's submit handler so it can also be triggered
  // directly once the 4th digit is entered (auto-submit), not just via the
  // Unlock button. Takes the pin value explicitly rather than reading `pin`
  // from closure. PinPad's onSubmit fires synchronously right after its
  // onChange, before React has applied the state update, so closure `pin`
  // there would be stale by one digit.
  const attemptLogin = async (pinValue: string) => {
    if (!selectedUser || isLoading || lockoutRemainingMs) return;

    setIsLoading(true);
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
            onSelectUser={setSelectedUser}
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
              setSelectedUser(null);
              setPin("");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
