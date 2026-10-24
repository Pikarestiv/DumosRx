"use client";

import { useState } from "react";
import { toast } from "sonner";
import { getTotalUserCount, getLocalStores } from "@/lib/db/queries/setup";
import { sync } from "@/lib/db/sync-engine";
import type { StoreOption } from "@/lib/types/store";
import type { OnboardingStep } from "./onboarding-step";

interface OnboardingSyncDeps {
  login: (identifier: string) => Promise<unknown>;
  navigate: (path: string) => void;
  setStep: (step: OnboardingStep) => void;
  notifyDeviceDataChanged: () => void;
  onNoLocalAccounts: () => void;
}

export function useOnboardingSync({
  login,
  navigate,
  setStep,
  notifyDeviceDataChanged,
  onNoLocalAccounts,
}: OnboardingSyncDeps) {
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState("Initializing sync...");
  const [existingStores, setExistingStores] = useState<StoreOption[]>([]);

  const startSyncProcess = async (email?: string) => {
    // Guards the identity transition against running twice and tells the failure paths whether login already happened.
    // Rationale: docs/CLIENT_COMMENTS.md#line-app-setup-use-onboarding-sync-ts-identity-ready
    let identityReady = false;

    const proceedOnceIdentityReady = async () => {
      if (identityReady) return;
      identityReady = true;

      setSyncProgress(80);
      setSyncStatus("Verifying account...");

      const totalCount = await getTotalUserCount();
      if (totalCount === 0) {
        setExistingStores(await getLocalStores());

        setSyncStatus("No account data found");
        toast.warning("Synchronization finished, but no staff accounts were found. Let's set up your local account.");

        await new Promise((r) => setTimeout(r, 1500));
        onNoLocalAccounts();
        setStep("register");
        return;
      }

      setSyncProgress(100);
      setSyncStatus("Signing you in...");
      if (email) {
        toast.success("Account ready! The rest of your data will keep syncing in the background.");
        await login(email);
        notifyDeviceDataChanged();
        setTimeout(() => navigate("/dashboard"), 800);
      } else {
        toast.success(`${totalCount} accounts recovered. Please log in.`);
        setTimeout(() => navigate("/login"), 800);
      }
    };

    try {
      setSyncProgress(10);
      setSyncStatus("Connecting to cloud storage...");
      await new Promise((r) => setTimeout(r, 800));

      setSyncProgress(30);
      setSyncStatus("Preparing data migration...");

      // A failed pull fires this callback too, having rolled back its whole
      // page (stores and users included), so only a success means identity.
      const result = await sync(false, true, (pullSucceeded) => {
        if (pullSucceeded) void proceedOnceIdentityReady();
      });

      if (!result.success && !identityReady) {
        setSyncStatus("Synchronization failed");
        toast.error(`Sync failed: ${result.error || "Unknown error"}`);
        setStep("cloud");
      } else if (!result.success) {
        console.warn("Background portion of setup sync failed after login:", result.error);
      }
    } catch (_err) {
      console.error("Sync error:", _err);
      if (!identityReady) {
        setSyncStatus("Error during sync");
        toast.error("An unexpected error occurred during sync");
        setStep("cloud");
      } else {
        console.warn("Background portion of setup sync threw after login:", _err);
      }
    }
  };

  return { syncProgress, syncStatus, existingStores, startSyncProcess };
}
