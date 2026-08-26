"use client";

import { useState } from "react";
import { RecentUser } from "@/lib/context/auth-context";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/context/auth-context";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { UserSelection } from "./user-selection";
import { PinEntry } from "./pin-entry";

interface LockScreenProps {
  recentUsers: RecentUser[];
  onLoginAsOther: () => void;
  onUnlockSuccess?: () => void;
  defaultUser?: RecentUser | null;
}

export function LockScreen({
  recentUsers,
  onLoginAsOther,
  onUnlockSuccess,
  defaultUser,
}: LockScreenProps) {
  const [selectedUser, setSelectedUser] = useState<RecentUser | null>(
    defaultUser || null,
  );
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  // Separated from the form's submit handler so it can also be triggered
  // directly once the 4th digit is entered (auto-submit), not just via the
  // Unlock button. Takes the pin value explicitly rather than reading `pin`
  // from closure. PinPad's onSubmit fires synchronously right after its
  // onChange, before React has applied the state update, so closure `pin`
  // there would be stale by one digit.
  const attemptLogin = async (pinValue: string) => {
    if (!selectedUser || isLoading) return;

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
        toast.error("Invalid PIN. Please try again.");
        setIsLoading(false);
      }
    } catch {
      toast.error("Login failed. Database might not be initialized.");
      setIsLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    attemptLogin(pin);
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
            handleLogin={handleLogin}
            onAutoSubmit={attemptLogin}
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
