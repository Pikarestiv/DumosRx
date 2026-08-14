"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "./use-onboarding";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Steps Components
import { WelcomeStep } from "@/components/setup/steps/welcome-step";
import { RegisterStep } from "@/components/setup/steps/register-step";
import { CloudStep } from "@/components/setup/steps/cloud-step";
import { BackupStep } from "@/components/setup/steps/backup-step";
import { SyncingStep } from "@/components/setup/steps/syncing-step";
import { SelectStoreStep } from "@/components/setup/steps/select-store-step";

export default function SetupPage() {
  const {
    onboardingStep,
    isLoading,
    isCheckingStatus,
    syncProgress,
    syncStatus,
    setStep,
    handleRegister,
    handleCloudRestore,
    handleLocalRestore,
    goBack,
    isCloudLinked,
    existingStores,
    searchParams,
    showConfirmSwitch,
    pendingStoreName,
    confirmCloudRestoreSwitch,
    cancelCloudRestoreSwitch,
    cloudStores,
    selectedStoreId,
    setSelectedStoreId,
    handleSelectStoreConfirm,
  } = useOnboarding();

  if (isCheckingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const fromLogin = searchParams.get("from") === "login";

  return (
    <div
      className="fixed inset-0 flex flex-col sm:items-center sm:justify-center p-0 sm:p-4 overflow-hidden bg-background"
      style={{ 
        paddingTop: "calc(var(--tauri-top, env(safe-area-inset-top, 0px)))",
        paddingBottom: "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)))"
      }}
    >
      {/* Mobile Top Background Layer */}
      <div className="absolute top-0 left-0 right-0 h-[50dvh] bg-primary sm:hidden z-0" />

      {/* Premium Desktop Background Effects */}
      <div className="absolute inset-0 z-0 hidden sm:block">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5 dark:from-primary/10 dark:to-accent/10" />
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 dark:bg-primary/20 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/5 dark:bg-accent/10 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000" />
      </div>

      {/* Mobile Top Section (1/4 height) */}
      <div className="sm:hidden relative z-10 flex flex-col items-center justify-center shrink-0 min-h-[25dvh] pt-4 pb-6">
        {onboardingStep !== "syncing" && (
          <button
            onClick={goBack}
            className="absolute left-6 top-6 inline-flex items-center text-sm font-medium text-primary-foreground/90 hover:text-primary-foreground transition-colors group cursor-pointer outline-none bg-transparent border-0 p-0"
          >
            <ArrowLeft className="h-5 w-5 mr-1 transform group-hover:-translate-x-1 transition-transform" />
            {fromLogin || onboardingStep === "welcome"
              ? "Login"
              : "Back"}
          </button>
        )}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        >
          {/* Logo is needed here, we need to import Image, so we must add it at top of file later or use img */}
          <img
            src="/logo.png"
            alt="Logo"
            className="w-40 object-contain brightness-0 invert"
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
        {onboardingStep !== "syncing" && (
          <div className="hidden sm:flex items-center justify-between mb-4 px-4 sm:px-0">
            <button
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors group cursor-pointer outline-none bg-transparent border-0 p-0"
              onClick={goBack}
            >
              <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
              {fromLogin || onboardingStep === "welcome"
                ? "Back to Login"
                : "Back to Setup"}
            </button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              asChild
            >
              <Link href="/login">
                <X className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {onboardingStep === "welcome" && <WelcomeStep onSetStep={setStep} />}

          {onboardingStep === "register" && (
            <RegisterStep
              onRegister={handleRegister}
              isLoading={isLoading}
              isCloudLinked={isCloudLinked}
              existingStores={existingStores}
            />
          )}

          {onboardingStep === "cloud" && (
            <CloudStep
              onCloudRestore={handleCloudRestore}
              isLoading={isLoading}
              onGoToRegister={() => setStep("register")}
            />
          )}

          {onboardingStep === "backup" && (
            <BackupStep
              onCancel={() => setStep("welcome")}
              onRestore={handleLocalRestore}
              onGoToCloud={() => setStep("cloud")}
              isLoading={isLoading}
            />
          )}

          {onboardingStep === "syncing" && (
            <SyncingStep progress={syncProgress} status={syncStatus} />
          )}

          {onboardingStep === "select-store" && (
            <SelectStoreStep
              stores={cloudStores}
              selectedStoreId={selectedStoreId}
              setSelectedStoreId={setSelectedStoreId}
              onConfirm={handleSelectStoreConfirm}
              onCancel={() => setStep("cloud")}
              isLoading={isLoading}
            />
          )}
        </AnimatePresence>
      </motion.div>

      <ConfirmDialog
        open={showConfirmSwitch}
        onOpenChange={(open) => {
          if (!open) {
            cancelCloudRestoreSwitch();
          }
        }}
        title="Confirm Store Switch"
        description={
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              This device is already configured with local data for{" "}
              <strong className="text-foreground font-semibold">&ldquo;{pendingStoreName}&rdquo;</strong>.
            </p>
            <p>
              Syncing a different store will{" "}
              <strong className="text-destructive font-semibold">permanently DELETE</strong>{" "}
              all current local data (products, batches, sales, and accounts) and replace it with the new store&apos;s data.
            </p>
            <p className="font-semibold text-foreground mt-2">Do you want to proceed?</p>
          </div>
        }
        confirmLabel="Wipe & Sync New Store"
        cancelLabel="Keep Current Store"
        variant="destructive"
        onConfirm={confirmCloudRestoreSwitch}
      />
    </div>
  );
}
