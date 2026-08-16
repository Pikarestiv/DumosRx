"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CardHeader } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { TraditionalLoginForm } from "@/components/auth/traditional-login-form";
import { LockScreen } from "@/components/auth/lock-screen";
import { AuthTabHeader } from "@/components/auth/auth-tab-header";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { useAuth } from "@/lib/context/auth-context";
import {
  SetupPromptHeader,
  SetupPromptContent,
} from "@/components/auth/setup-prompt";
import { useLogin } from "@/hooks/use-login";
import { useDeviceAuthStatus } from "@/hooks/use-device-auth-status";
import { useOnboarding } from "@/app/setup/use-onboarding";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { WelcomeStep } from "@/components/setup/steps/welcome-step";
import { RegisterStep } from "@/components/setup/steps/register-step";
import { CloudStep } from "@/components/setup/steps/cloud-step";
import { BackupStep } from "@/components/setup/steps/backup-step";
import { SyncingStep } from "@/components/setup/steps/syncing-step";
import { SelectStoreStep } from "@/components/setup/steps/select-store-step";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "New credentials" mode (from the dashboard lock overlay's "Login as
  // someone else") — distinct from a plain /login visit, which otherwise
  // redirects straight to the dashboard's own lock overlay when recent
  // accounts already exist, to avoid ever showing two separate lock screens.
  const isNewCredentialsMode = searchParams.get("mode") === "new";

  const { isChecking, userCount, recentUsers } = useDeviceAuthStatus();
  const { isAuthenticated } = useAuth();

  const {
    username,
    setUsername,
    pin,
    setPin,
    isLoading,
    showTraditionalLogin,
    setShowTraditionalLogin,
    hasError,
    handleLogin,
  } = useLogin();

  const onboarding = useOnboarding();

  // Login and Setup are tabs on this one page, not separate routes — no
  // navigation, no remount, no second loading spinner when switching.
  // Guard: a device that already has accounts can't land on setup's
  // welcome/select-store steps (that flow assumes a brand-new device and
  // risks clobbering real local data) — only backup/cloud/syncing/register
  // are safe entry points there. `register` is included because
  // handleRegister() is purely additive (inserts a new store + admin) even
  // when the device already has other local accounts — unlike
  // select-store's cloud-switch flow, it never wipes existing data.
  // Computed here instead of redirecting after mount, so an unsafe request
  // never flashes setup content before bouncing back.
  const requestedTab = searchParams.get("tab") === "setup" ? "setup" : "login";
  const step = searchParams.get("step");
  const isSafeSetupEntry =
    step === "backup" ||
    step === "cloud" ||
    step === "syncing" ||
    step === "register";
  const activeTab =
    requestedTab === "setup" && userCount > 0 && !isSafeSetupEntry
      ? "login"
      : requestedTab;

  const setupHref =
    userCount > 0 ? "/login?tab=setup&step=cloud" : "/login?tab=setup";

  // Only bounce to the dashboard's own lock overlay when there's actually a
  // live (but idle-locked) session to hand off to — i.e. `isAuthenticated`.
  // Without this check, a real logout (user cleared, recentUsers/userCount
  // untouched) looked identical to "idle-locked", so /login redirected to
  // /dashboard, which immediately redirected back to /login (no `user`),
  // forever — the flicker loop. When there's no live session, this page
  // renders its own account-tile picker (LockScreen) instead of redirecting.
  const showAccountSelection =
    activeTab === "login" &&
    isAuthenticated &&
    userCount > 0 &&
    recentUsers.length > 0 &&
    !showTraditionalLogin &&
    !isNewCredentialsMode;

  const showRecentUserSelection =
    activeTab === "login" &&
    !isAuthenticated &&
    userCount > 0 &&
    recentUsers.length > 0 &&
    !showTraditionalLogin &&
    !isNewCredentialsMode;

  useEffect(() => {
    if (showAccountSelection) {
      router.replace("/dashboard");
    }
  }, [showAccountSelection, router]);

  if (isChecking || showAccountSelection) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const showBack =
    activeTab === "setup"
      ? onboarding.onboardingStep !== "syncing"
      : !recentUsers.length || showTraditionalLogin || isNewCredentialsMode;

  const handleBack = () => {
    if (activeTab === "setup") {
      onboarding.goBack();
    } else if (isNewCredentialsMode) {
      // Arrived here via "Login as someone else" — that only calls
      // unlock() before navigating, it never logs the current user out, so
      // `user` is still set and /dashboard renders normally. Backing out
      // just cancels the account switch and resumes the existing session,
      // rather than going to "/" (which has nothing to do with this flow).
      router.push("/dashboard");
    } else {
      router.push("/");
    }
  };

  // Cloud Restore and Local Backup are the two setup steps that render a
  // single simple Card (like the login tab), so the tab header is injected
  // inside their Card for visual consistency. Other setup steps (welcome,
  // register, select-store, syncing) have more complex/multi-card layouts,
  // so the header stays floated above them.
  const isCardSetupStep =
    onboarding.onboardingStep === "cloud" ||
    onboarding.onboardingStep === "backup";

  // Header (Back + Login/Setup switcher) is hidden entirely for ?mode=new —
  // a lone back arrow with no switcher looked unbalanced, especially on
  // mobile. The way off this screen instead is a secondary "Cancel" button
  // in the login form itself (see TraditionalLoginForm's onCancel).
  const authHeader = !isNewCredentialsMode ? (
    <AuthTabHeader
      variant={activeTab === "login" || isCardSetupStep ? "card" : "standalone"}
      active={activeTab === "login" ? "login" : "setup"}
      showBack={showBack}
      onBack={handleBack}
      setupHref={setupHref}
    />
  ) : null;

  return (
    <div
      className="fixed inset-0 flex flex-col sm:items-center sm:justify-center p-0 sm:p-4 overflow-y-auto bg-background"
      style={{
        paddingTop: "calc(var(--tauri-top, env(safe-area-inset-top, 0px)))",
        paddingBottom:
          "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)))",
      }}
    >
      {/* Mobile Top Background Layer */}
      <div className="absolute top-0 left-0 right-0 h-[50dvh] bg-primary sm:hidden z-0" />

      {/* Desktop Background Effects */}
      <div className="absolute inset-0 z-0 hidden sm:block">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/60" />
      </div>

      {/* Mobile Top Section (1/4 height) */}
      <div className="sm:hidden relative z-10 flex flex-col items-center justify-center shrink-0 min-h-[25dvh] py-4">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        >
          <Image
            src="/logo.png"
            alt="Logo"
            width={160}
            height={60}
            className="object-contain brightness-0 invert"
            style={{ height: "auto" }}
          />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full h-full sm:h-auto sm:max-w-md z-10 flex flex-col mx-auto"
      >
        {activeTab === "login" ? (
          <AuthCardShell
            variant="page"
            header={<div className="px-4">{authHeader}</div>}
          >
            {userCount === 0 && (
              <CardHeader className="pt-8 sm:pt-2 pb-2 items-center text-center">
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

            {userCount > 0 &&
              (recentUsers.length === 0 ||
                showTraditionalLogin ||
                isNewCredentialsMode) && (
                <TraditionalLoginForm
                  username={username}
                  setUsername={setUsername}
                  pin={pin}
                  setPin={setPin}
                  isLoading={isLoading}
                  hasError={hasError}
                  onSubmit={handleLogin}
                  onGoToRegister={
                    isNewCredentialsMode ? undefined : onboarding.goToRegister
                  }
                  onGoToBackup={
                    isNewCredentialsMode
                      ? undefined
                      : () => onboarding.setStep("backup")
                  }
                  onCancel={isNewCredentialsMode ? handleBack : undefined}
                />
              )}
          </AuthCardShell>
        ) : (
          <>
            {/* Cloud Restore and Local Backup get the header injected inside
                their own Card (see isCardSetupStep) for consistency with the
                login tab. Every other setup step renders a more complex
                layout the header can't be injected into, so it floats above
                instead. */}
            {!isCardSetupStep && authHeader}

            <AnimatePresence mode="wait">
              {onboarding.onboardingStep === "welcome" && (
                <WelcomeStep
                  onSetStep={onboarding.setStep}
                  onGoToRegister={onboarding.goToRegister}
                />
              )}

              {onboarding.onboardingStep === "register" && (
                <RegisterStep
                  onRegister={onboarding.handleRegister}
                  isLoading={onboarding.isLoading}
                  isCloudLinked={onboarding.isCloudLinked}
                  existingStores={onboarding.existingStores}
                />
              )}

              {onboarding.onboardingStep === "cloud" && (
                <CloudStep
                  onCloudRestore={onboarding.handleCloudRestore}
                  isLoading={onboarding.isLoading}
                  onGoToRegister={onboarding.goToRegister}
                  onGoToBackup={() => onboarding.setStep("backup")}
                  header={authHeader}
                />
              )}

              {onboarding.onboardingStep === "backup" && (
                <BackupStep
                  onCancel={() => onboarding.setStep("welcome")}
                  onRestore={onboarding.handleLocalRestore}
                  onGoToCloud={() => onboarding.setStep("cloud")}
                  isLoading={onboarding.isLoading}
                  header={authHeader}
                />
              )}

              {onboarding.onboardingStep === "syncing" && (
                <SyncingStep
                  progress={onboarding.syncProgress}
                  status={onboarding.syncStatus}
                />
              )}

              {onboarding.onboardingStep === "select-store" && (
                <SelectStoreStep
                  stores={onboarding.cloudStores}
                  selectedStoreId={onboarding.selectedStoreId}
                  setSelectedStoreId={onboarding.setSelectedStoreId}
                  onConfirm={onboarding.handleSelectStoreConfirm}
                  onCancel={() => onboarding.setStep("cloud")}
                  isLoading={onboarding.isLoading}
                />
              )}
            </AnimatePresence>

            <ConfirmDialog
              open={onboarding.showConfirmSwitch}
              onOpenChange={(open) => {
                if (!open) {
                  onboarding.cancelCloudRestoreSwitch();
                }
              }}
              title="Confirm Store Switch"
              description={
                <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    This device is already configured with local data for{" "}
                    <strong className="text-foreground font-semibold">
                      &ldquo;{onboarding.pendingStoreName}&rdquo;
                    </strong>
                    .
                  </p>
                  <p>
                    Syncing a different store will{" "}
                    <strong className="text-destructive font-semibold">
                      permanently DELETE
                    </strong>{" "}
                    all current local data (products, batches, sales, and
                    accounts) and replace it with the new store&apos;s data.
                  </p>
                  <p className="font-semibold text-foreground mt-2">
                    Do you want to proceed?
                  </p>
                </div>
              }
              confirmLabel="Wipe & Sync New Store"
              cancelLabel="Keep Current Store"
              variant="destructive"
              onConfirm={onboarding.confirmCloudRestoreSwitch}
            />
          </>
        )}
      </motion.div>
    </div>
  );
}
