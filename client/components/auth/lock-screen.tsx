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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setIsLoading(true);
    try {
      const success = await login(selectedUser.username, pin);
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

  return (
    <div className="flex-1 flex flex-col w-full">
      <AnimatePresence mode="wait">
        {!selectedUser ? (
          <UserSelection
            key="grid"
            recentUsers={recentUsers}
            onSelectUser={setSelectedUser}
            onLoginAsOther={onLoginAsOther}
          />
        ) : (
          <PinEntry
            key="pin"
            selectedUser={selectedUser}
            pin={pin}
            setPin={setPin}
            isLoading={isLoading}
            hasError={hasError}
            handleLogin={handleLogin}
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
