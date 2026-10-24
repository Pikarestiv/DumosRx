"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { generateId, setActiveStoreId } from "@/lib/db/core";
import { getLocalStores } from "@/lib/db/queries/setup";
import { sync, syncSubscriptionStatus } from "@/lib/db/sync-engine";
import { restoreDatabase, clearDatabaseForNewStore } from "@/lib/db/core";
import { apiClient } from "@/lib/api/client";
import { withNetworkRetry } from "@/lib/api/retry-on-network-error";
import { toast } from "sonner";
import { markRestoredForCloudLinkNotice } from "@/lib/utils/post-restore-notice";
import type { StoreOption } from "@/lib/types/store";
import { hashPin } from "@/lib/utils/pin-hash";
import { setStoredActiveStoreId } from "@/lib/storage-keys";
import { navigateWithFullReload } from "@/lib/utils/full-page-navigate";
import { parseOnboardingStep, type OnboardingStep } from "./onboarding-step";
import {
  seedCloudLinkedStoreAndAdmin,
  seedOfflineStoreAndAdmin,
  type PendingNewRegistration,
} from "./onboarding-local-writes";
import { useOnboardingSync } from "./use-onboarding-sync";

export type { OnboardingStep } from "./onboarding-step";

export function useOnboarding(onDeviceDataChanged?: () => Promise<unknown> | void) {
  const [isLoading, setIsLoading] = useState(false);
  const notifyDeviceDataChanged = () => {
    void onDeviceDataChanged?.();
  };

  const [showConfirmSwitch, setShowConfirmSwitch] = useState(false);
  const [pendingStoreName, setPendingStoreName] = useState("");
  // Set only when showConfirmSwitch was triggered by a brand-new signup (not the existing-account store-switch flow) finding…
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-setup-use-onboarding-ts-L31
  const [pendingNewRegistration, setPendingNewRegistration] = useState<PendingNewRegistration | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");

  const [cloudStores, setCloudStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const { login, linkCloudAccount, isCloudLinked, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // `isCloudLinked` from auth-context is a device-wide flag (true whenever a cloud auth token is cached in localStorage); it…
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-setup-use-onboarding-ts-L54
  const [justCloudLinkedForRegister, setJustCloudLinkedForRegister] = useState(false);
  const registerIsCloudLinked = isCloudLinked && justCloudLinkedForRegister;

  const onboardingStep = parseOnboardingStep(searchParams.get("step"));

  const setStep = (step: OnboardingStep) => {
    const params = new URLSearchParams(searchParams.toString());
    // Always land on the setup tab.
    // Rationale: docs/CLIENT_COMMENTS.md#line-app-setup-use-onboarding-ts-L76
    params.set("tab", "setup");
    if (step === "welcome") {
      params.delete("step");
    } else {
      params.set("step", step);
    }
    router.push(`?${params.toString()}`);
  };

  const { syncProgress, syncStatus, existingStores, startSyncProcess } = useOnboardingSync({
    login,
    navigate: (path) => router.push(path),
    setStep,
    notifyDeviceDataChanged,
    onNoLocalAccounts: () => setJustCloudLinkedForRegister(true),
  });

  const goToRegister = () => {
    setJustCloudLinkedForRegister(false);
    setStep("register");
  };

  // Owns its own error handling so either caller's failure gets this step's message and clears isLoading.
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-setup-use-onboarding-ts-finish-new-account-setup
  const finishNewAccountSetup = async (registration: PendingNewRegistration) => {
    const { store, username, pin, storeName } = registration;
    const now = new Date().toISOString();

    try {
      await seedCloudLinkedStoreAndAdmin(store, registration, now);

      // Seeds the trial status before the background sync() - see A-156, docs/FIXED_BUGS.md.
      try {
        await syncSubscriptionStatus();
      } catch (err) {
        console.error("Failed to seed initial subscription status", err);
      }

      setStoredActiveStoreId(store.id);
      setActiveStoreId(store.id);
      toast.success(`${storeName} created and linked to your cloud account!`);

      const success = await login(username, pin);
      // Refetches /login's own stale mount snapshot - see A-154, docs/FIXED_BUGS.md.
      notifyDeviceDataChanged();
      if (success) {
        sync(false, true).catch(console.error);
        router.push("/dashboard");
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Failed to finish new account setup", err);
      toast.error("Your account was created, but we couldn't finish setting up this device. Please contact support.");
      setIsLoading(false);
    }
  };

  const handleRegister = async (
    firstName: string,
    lastName: string,
    username: string,
    pin: string,
    storeName: string,
    existingStoreId?: string,
    email?: string,
    password?: string,
    storeType?: string,
    phone?: string,
  ) => {
    setIsLoading(true);
    try {
      const now = new Date().toISOString();
      const hashedPin = hashPin(pin);

      // Brand-new setup creates the cloud account first so local rows carry the server's real ids.
      // Rationale: docs/CLIENT_COMMENTS.md#line-app-setup-use-onboarding-ts-cloud-first-register
      if (!registerIsCloudLinked) {
        if (!email || !password) {
          toast.error("Email and password are required to create your account");
          setIsLoading(false);
          return;
        }

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          toast.error("You're offline. Connect to the internet to create your cloud account.");
          setIsLoading(false);
          return;
        }

        let response: { token: string; user: { id: string } };
        try {
          response = await withNetworkRetry(() =>
            apiClient.register({
              first_name: firstName,
              last_name: lastName,
              email,
              username,
              pin,
              password,
              store_name: storeName,
              store_type: storeType,
              phone,
            }),
          );
        } catch (err) {
          const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
          const isEmailTaken = status === 422 && err instanceof Error && /email.*already.*taken/i.test(err.message);
          if (!isEmailTaken) throw err;

          // Self-heals a lost-response retry instead of dead-ending (see
          // client/AGENTS.md's "Cloud setup/registration network calls").
          const loginResponse = await withNetworkRetry(() => apiClient.login(email, password));
          response = { token: loginResponse.token, user: { id: loginResponse.user.id } };
        }

        apiClient.setToken(response.token);

        const stores = await withNetworkRetry(() => apiClient.getStores());
        const store = stores[0];
        if (!store) {
          toast.error("Account created, but no store was returned. Please contact support.");
          setIsLoading(false);
          return;
        }

        const newRegistration: PendingNewRegistration = {
          store, userId: response.user.id, firstName, lastName, username, pin, hashedPin, storeName,
        };
        // Leftover data from a previously linked account - see client/AGENTS.md's clearDatabaseForNewStore() note.
        const localStores = await getLocalStores();
        if (localStores.length > 0) {
          setPendingStoreName(localStores[0].name);
          setPendingNewRegistration(newRegistration);
          setShowConfirmSwitch(true);
          setIsLoading(false);
          return;
        }

        await finishNewAccountSetup(newRegistration);
        return;
      }

      // Already cloud-linked (the zero-local-users fallback): a fresh local id is adopted by the next push.
      const userId = generateId();
      const storeId = existingStoreId || generateId();
      await seedOfflineStoreAndAdmin(
        storeId,
        storeName,
        Boolean(existingStoreId),
        { userId, firstName, lastName, username, hashedPin },
        now,
      );

      toast.success(`${storeName} configured and administrator created!`);

      const success = await login(username, pin);
      notifyDeviceDataChanged();
      if (success) {
        toast.info("Pushing your account to cloud...");
        sync(false, true).catch(console.error);
        router.push("/dashboard");
      }
    } catch (_err) {
      console.error("Registration failed", _err);
      const message = _err instanceof Error ? _err.message : "";
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        toast.error("You're offline. Connect to the internet to create your cloud account.");
      } else if (message) {
        toast.error(message);
      } else {
        toast.error("Failed to complete setup");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloudRestore = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const result = await linkCloudAccount(email, pass);
      if (result.success) {
        await withNetworkRetry(() => apiClient.getProfile());
        const stores = await withNetworkRetry(() => apiClient.getStores());

        if (stores.length === 0) {
          toast.error("No stores found on your cloud account. Please register a store first.");
          setIsLoading(false);
          return;
        }

        const localStores = await getLocalStores();

        if (stores.length === 1) {
          const store = stores[0];
          setSelectedStoreId(store.id);
          setPendingEmail(email);

          if (localStores.length > 0 && localStores[0].id !== store.id) {
            setPendingStoreName(localStores[0].name);
            setShowConfirmSwitch(true);
            setIsLoading(false);
            return;
          }

          setStoredActiveStoreId(store.id);
          setActiveStoreId(store.id);
          setStep("syncing");
          void startSyncProcess(email);
        } else {
          setCloudStores(stores);
          setSelectedStoreId(stores[0].id);
          setPendingEmail(email);
          setStep("select-store");
          setIsLoading(false);
        }
      } else {
        toast.error(result.message);
      }
    } catch (_err) {
      console.error("Cloud restore failed", _err);
      toast.error("Cloud connection failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectStoreConfirm = async () => {
    setIsLoading(true);
    const selectedStore = cloudStores.find(s => s.id === selectedStoreId);
    if (!selectedStore) {
      toast.error("Selected store not found");
      setIsLoading(false);
      return;
    }

    const localStores = await getLocalStores();
    if (localStores.length > 0 && localStores[0].id !== selectedStoreId) {
      setPendingStoreName(localStores[0].name);
      setShowConfirmSwitch(true);
      setIsLoading(false);
      return;
    }

    setStoredActiveStoreId(selectedStoreId);
    setActiveStoreId(selectedStoreId);
    setStep("syncing");
    void startSyncProcess(pendingEmail);
  };

  const confirmCloudRestoreSwitch = async () => {
    setShowConfirmSwitch(false);
    setIsLoading(true);
    try {
      await clearDatabaseForNewStore();
      // In-memory zustand drafts survive the wipe; see use-pos-cart.ts's own note.
      try {
        const { clearLocalDrafts } = await import(
          "@/lib/utils/clear-local-drafts"
        );
        clearLocalDrafts();
      } catch (err) {
        console.warn("Failed to clear the outgoing store's drafts", err);
      }
      notifyDeviceDataChanged();

      if (pendingNewRegistration) {
        const registration = pendingNewRegistration;
        setPendingNewRegistration(null);
        await finishNewAccountSetup(registration);
        return;
      }

      const targetStoreId = selectedStoreId || (cloudStores.length === 1 ? cloudStores[0].id : "");
      if (targetStoreId) {
        setStoredActiveStoreId(targetStoreId);
        setActiveStoreId(targetStoreId);
      }

      setStep("syncing");
      void startSyncProcess(pendingEmail);
    } catch (_err) {
      console.error("Cloud restore switch failed", _err);
      toast.error("Failed to clear database for new store");
      setIsLoading(false);
    }
  };

  const cancelCloudRestoreSwitch = async () => {
    setShowConfirmSwitch(false);
    setPendingNewRegistration(null);
    await logout();
    setIsLoading(false);
  };

  const goBack = () => {
    if (onboardingStep === "welcome") {
      router.push("/login");
    } else if (onboardingStep === "select-store") {
      setStep("cloud");
    } else {
      setStep("welcome");
    }
  };

  const handleLocalRestore = async (file: File) => {
    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      await restoreDatabase(new Uint8Array(buffer));
      toast.success("Database restored successfully!");
      // Full browser navigation so /login's account detection re-runs against the restored database.
      // Rationale: docs/CLIENT_COMMENTS.md#line-app-setup-use-onboarding-ts-local-restore-reload
      markRestoredForCloudLinkNotice();
      setTimeout(() => navigateWithFullReload("/login"), 1000);
    } catch (err) {
      console.error("Local restore failed:", err);
      toast.error("Failed to restore from backup file. Ensure it is a valid .drx file.");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    onboardingStep,
    isLoading,
    syncProgress,
    syncStatus,
    setStep,
    goToRegister,
    handleRegister,
    handleCloudRestore,
    handleLocalRestore,
    goBack,
    isCloudLinked: registerIsCloudLinked,
    existingStores,
    searchParams,
    showConfirmSwitch,
    setShowConfirmSwitch,
    pendingStoreName,
    isPendingNewRegistration: pendingNewRegistration !== null,
    confirmCloudRestoreSwitch,
    cancelCloudRestoreSwitch,
    cloudStores,
    selectedStoreId,
    setSelectedStoreId,
    handleSelectStoreConfirm,
  };
}

export type Onboarding = ReturnType<typeof useOnboarding>;
