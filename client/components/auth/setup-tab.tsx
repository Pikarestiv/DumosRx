"use client";

import { AnimatePresence } from "framer-motion";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { WelcomeStep } from "@/components/setup/steps/welcome-step";
import { RegisterStep } from "@/components/setup/steps/register-step";
import { CloudStep } from "@/components/setup/steps/cloud-step";
import { BackupStep } from "@/components/setup/steps/backup-step";
import { SyncingStep } from "@/components/setup/steps/syncing-step";
import { SelectStoreStep } from "@/components/setup/steps/select-store-step";
import type { Onboarding } from "@/app/setup/use-onboarding";

export interface SetupTabProps {
  authHeader: React.ReactNode;
  onboarding: Onboarding;
}

// Every setup step renders through AuthCardShell now, so the header is
// always injected inside the step's own Card (see each step's `header`
// prop) — no per-step special-casing needed here to decide where it goes.
export function SetupTab({ authHeader, onboarding }: SetupTabProps) {
  return (
    <>
      <AnimatePresence mode="wait">
        {onboarding.onboardingStep === "welcome" && (
          <WelcomeStep
            onSetStep={onboarding.setStep}
            onGoToRegister={onboarding.goToRegister}
            header={authHeader}
          />
        )}

        {onboarding.onboardingStep === "register" && (
          <RegisterStep
            onRegister={onboarding.handleRegister}
            isLoading={onboarding.isLoading}
            isCloudLinked={onboarding.isCloudLinked}
            existingStores={onboarding.existingStores}
            header={authHeader}
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
            header={authHeader}
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
            header={authHeader}
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
              all current local data (products, batches, sales, and accounts)
              and replace it with the new store&apos;s data.
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
  );
}
