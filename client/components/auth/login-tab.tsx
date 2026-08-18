"use client";

import { CardHeader } from "@/components/ui/card";
import { TraditionalLoginForm } from "@/components/auth/traditional-login-form";
import { LockScreen } from "@/components/auth/lock-screen";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { SetupPromptHeader, SetupPromptContent } from "@/components/auth/setup-prompt";
import type { RecentUser } from "@/lib/context/auth-context";

export interface LoginTabProps {
  authHeader: React.ReactNode;
  userCount: number;
  showRecentUserSelection: boolean;
  recentUsers: RecentUser[];
  showTraditionalLogin: boolean;
  isNewCredentialsMode: boolean;
  username: string;
  setUsername: (value: string) => void;
  pin: string;
  setPin: (value: string) => void;
  isLoading: boolean;
  hasError: boolean;
  handleLogin: (e: React.FormEvent) => void;
  setShowTraditionalLogin: (value: boolean) => void;
  onGoToRegister?: () => void;
  onGoToCloud?: () => void;
  onCancel?: () => void;
}

export function LoginTab({
  authHeader,
  userCount,
  showRecentUserSelection,
  recentUsers,
  showTraditionalLogin,
  isNewCredentialsMode,
  username,
  setUsername,
  pin,
  setPin,
  isLoading,
  hasError,
  handleLogin,
  setShowTraditionalLogin,
  onGoToRegister,
  onGoToCloud,
  onCancel,
}: LoginTabProps) {
  const showTraditionalForm =
    userCount > 0 &&
    (recentUsers.length === 0 || showTraditionalLogin || isNewCredentialsMode);

  return (
    <AuthCardShell variant="page" header={authHeader}>
      {userCount === 0 && (
        <CardHeader className="px-0 py-0 items-center text-center">
          <SetupPromptHeader />
        </CardHeader>
      )}

      {userCount === 0 && <SetupPromptContent />}

      {showRecentUserSelection && (
        <div className="flex-1 flex flex-col pt-1 pb-0 px-4 sm:pb-6 sm:px-6">
          <LockScreen
            recentUsers={recentUsers}
            onLoginAsOther={() => setShowTraditionalLogin(true)}
          />
        </div>
      )}

      {showTraditionalForm && (
        <TraditionalLoginForm
          username={username}
          setUsername={setUsername}
          pin={pin}
          setPin={setPin}
          isLoading={isLoading}
          hasError={hasError}
          onSubmit={handleLogin}
          onGoToRegister={onGoToRegister}
          onGoToCloud={onGoToCloud}
          onCancel={onCancel}
        />
      )}
    </AuthCardShell>
  );
}
