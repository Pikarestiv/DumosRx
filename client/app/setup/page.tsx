"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useOnboarding } from "./use-onboarding";

// Steps Components
import { WelcomeStep } from "@/components/setup/steps/welcome-step";
import { RegisterStep } from "@/components/setup/steps/register-step";
import { CloudStep } from "@/components/setup/steps/cloud-step";
import { BackupStep } from "@/components/setup/steps/backup-step";
import { SyncingStep } from "@/components/setup/steps/syncing-step";

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
    goBack,
    searchParams,
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Premium Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5 dark:from-primary/10 dark:to-accent/10" />
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 dark:bg-primary/20 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/5 dark:bg-accent/10 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000" />
      </div>

      <div
        className="absolute z-20 flex items-center gap-4"
        style={{ top: "calc(var(--tauri-top, 0px) + 2rem)", right: "2rem" }}
      >
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md z-10"
      >
        {onboardingStep !== "syncing" && (
          <div className="flex items-center justify-between mb-8">
            <Button
              variant="ghost"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors group p-0"
              onClick={goBack}
            >
              <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
              {fromLogin || onboardingStep === "welcome"
                ? "Back to Login"
                : "Back to Setup"}
            </Button>

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
          {onboardingStep === "welcome" && (
            <WelcomeStep onSetStep={setStep} />
          )}

          {onboardingStep === "register" && (
            <RegisterStep onRegister={handleRegister} isLoading={isLoading} />
          )}

          {onboardingStep === "cloud" && (
            <CloudStep onCloudRestore={handleCloudRestore} isLoading={isLoading} />
          )}

          {onboardingStep === "backup" && (
            <BackupStep onCancel={() => setStep("welcome")} />
          )}

          {onboardingStep === "syncing" && (
            <SyncingStep progress={syncProgress} status={syncStatus} />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
