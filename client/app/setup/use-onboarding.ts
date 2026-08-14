"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { generateId, execute } from "@/lib/db/core";

import { checkIfTableExists, getActiveUserCount, getTotalUserCount, getLocalStores } from "@/lib/db/queries/setup";
import { sync } from "@/lib/db/sync-engine";
import { restoreDatabase, clearDatabaseForNewStore } from "@/lib/db/core";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import type { StoreOption } from "@/lib/types/store";

export type OnboardingStep = "welcome" | "register" | "cloud" | "backup" | "syncing" | "select-store";

export function useOnboarding() {
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("welcome");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState("Initializing sync...");
  const [existingStores, setExistingStores] = useState<StoreOption[]>([]);

  // Custom modal confirmation states
  const [showConfirmSwitch, setShowConfirmSwitch] = useState(false);
  const [pendingStoreName, setPendingStoreName] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");

  // Store selection states
  const [cloudStores, setCloudStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const { login, linkCloudAccount, isCloudLinked, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const step = searchParams.get("step") as OnboardingStep;
    if (step && ["welcome", "register", "cloud", "backup", "syncing", "select-store"].includes(step)) {
      setOnboardingStep(step);
    } else {
      setOnboardingStep("welcome");
    }
    checkStatus();
  }, [searchParams]);

  const checkStatus = async () => {
    try {
      const tableExists = await checkIfTableExists("users");
      if (tableExists) {
        const count = await getActiveUserCount();
        if (
          count > 0 &&
          searchParams.get("step") !== "backup" &&
          searchParams.get("step") !== "cloud" &&
          searchParams.get("step") !== "syncing"
        ) {
          router.replace("/login");
          return;
        }
      }
    } catch (e) {
      console.error("Status check failed", e);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const setStep = (step: OnboardingStep) => {
    const params = new URLSearchParams(searchParams.toString());
    if (step === "welcome") {
      params.delete("step");
    } else {
      params.set("step", step);
    }
    router.push(`?${params.toString()}`);
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
  ) => {
    setIsLoading(true);
    try {
      const now = new Date().toISOString();

      // Brand-new setup (no cloud account linked yet): always create the
      // account + store in the cloud first, then seed local SQLite with the
      // server's real ids. A local-only id generated before a cloud identity
      // exists can never be reconciled later — every row that references it
      // as a foreign key (sales.cashier_id, stock_movements.performed_by,
      // etc.) becomes permanently unsyncable. See reconcile-identity.ts for
      // the one-time recovery this exact failure mode required.
      if (!isCloudLinked) {
        if (!email || !password) {
          toast.error("Email and password are required to create your account");
          setIsLoading(false);
          return;
        }

        const response = await apiClient.register({
          first_name: firstName,
          last_name: lastName,
          email,
          username,
          pin,
          password,
          store_name: storeName,
        });

        apiClient.setToken(response.token);

        const stores = await apiClient.getStores();
        const store = stores[0];
        if (!store) {
          toast.error("Account created, but no store was returned. Please contact support.");
          setIsLoading(false);
          return;
        }

        await execute(
          "INSERT INTO stores (id, name, is_initialized, created_at, updated_at, _synced, auto_sync_enabled, auto_sync_interval) VALUES (?, ?, ?, ?, ?, ?, 1, 30)",
          [store.id, store.name, 1, now, now, 1],
        );

        await execute(
          "INSERT INTO users (id, first_name, last_name, username, pin, role, store_id, is_active, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [response.user.id, firstName, lastName, username, pin, "admin", store.id, 1, now, now, 1],
        );

        localStorage.setItem("dumos_active_store_id", store.id);
        toast.success(`${storeName} created and linked to your cloud account!`);

        const success = await login(username, pin);
        if (success) {
          sync(false, true).catch(console.error);
          router.push("/dashboard");
        }
        return;
      }

      // Already cloud-linked — reached via the "sync completed but found no
      // local accounts" fallback (see startSyncProcess below). Generating a
      // fresh local id here is safe: the cloud identity already exists, and
      // the subsequent sync() push adopts this same id server-side.
      const userId = generateId();
      const storeId = existingStoreId || generateId();

      if (!existingStoreId) {
        await execute(
          "INSERT INTO stores (id, name, is_initialized, created_at, updated_at, _synced, auto_sync_enabled, auto_sync_interval) VALUES (?, ?, ?, ?, ?, ?, 1, 30)",
          [storeId, storeName, 1, now, now, 0],
        );
      } else {
        await execute(
          "UPDATE stores SET name = ?, is_initialized = 1, updated_at = ? WHERE id = ?",
          [storeName, now, storeId],
        );
      }

      await execute(
        "INSERT INTO users (id, first_name, last_name, username, pin, role, store_id, is_active, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [userId, firstName, lastName, username, pin, "admin", storeId, 1, now, now, 0],
      );

      toast.success(`${storeName} configured and administrator created!`);

      const success = await login(username, pin);
      if (success) {
        toast.info("Pushing your account to cloud...");
        sync(false, true).catch(console.error);
        router.push("/dashboard");
      }
    } catch (_err) {
      console.error("Registration failed", _err);
      toast.error("Failed to complete setup");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloudRestore = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const result = await linkCloudAccount(email, pass);
      if (result.success) {
        // Fetch user profile and available stores from cloud
        await apiClient.getProfile();
        const stores = await apiClient.getStores();

        if (stores.length === 0) {
          toast.error("No stores found on your cloud account. Please register a store first.");
          setIsLoading(false);
          return;
        }

        const localStores = await getLocalStores();

        if (stores.length === 1) {
          // Exactly one store, auto-select it
          const store = stores[0];
          setSelectedStoreId(store.id);
          setPendingEmail(email);

          if (localStores.length > 0 && localStores[0].id !== store.id) {
            setPendingStoreName(localStores[0].name);
            setShowConfirmSwitch(true);
            setIsLoading(false);
            return;
          }

          localStorage.setItem("dumos_active_store_id", store.id);
          setStep("syncing");
          startSyncProcess(email);
        } else {
          // Multiple stores, transition to select-store step
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

    localStorage.setItem("dumos_active_store_id", selectedStoreId);
    setStep("syncing");
    startSyncProcess(pendingEmail);
  };

  const confirmCloudRestoreSwitch = async () => {
    setShowConfirmSwitch(false);
    setIsLoading(true);
    try {
      // Wipe the local database to prepare for a clean initial sync of the new store
      await clearDatabaseForNewStore();

      const targetStoreId = selectedStoreId || (cloudStores.length === 1 ? cloudStores[0].id : "");
      if (targetStoreId) {
        localStorage.setItem("dumos_active_store_id", targetStoreId);
      }

      setStep("syncing");
      startSyncProcess(pendingEmail);
    } catch (_err) {
      console.error("Cloud restore switch failed", _err);
      toast.error("Failed to clear database for new store");
      setIsLoading(false);
    }
  };

  const cancelCloudRestoreSwitch = async () => {
    setShowConfirmSwitch(false);
    await logout();
    setIsLoading(false);
  };

  const startSyncProcess = async (email?: string) => {
    try {
      setSyncProgress(10);
      setSyncStatus("Connecting to cloud storage...");
      await new Promise((r) => setTimeout(r, 800));
      
      setSyncProgress(30);
      setSyncStatus("Preparing data migration...");
      
      const result = await sync(false, true);
      
      if (result.success) {
        setSyncProgress(80);
        setSyncStatus("Verifying synced records...");
        
        // Verify we actually have users in the synced data
        const totalCount = await getTotalUserCount();
        if (totalCount === 0) {
          // If no user exists, maybe we already created one but just making sure
          const stores = await getLocalStores();
          setExistingStores(stores);
          
          setSyncStatus("No account data found");
          toast.warning("Synchronization finished, but no staff accounts were found. Let's set up your local account.");
          
          await new Promise((r) => setTimeout(r, 1500));
          setStep("register");
          return;
        }

        setSyncProgress(100);
        setSyncStatus("Sync complete!");
        if (email) {
          toast.success(`Sync complete! Logging you into the local dashboard...`);
          await login(email);
          setTimeout(() => router.push("/dashboard"), 1500);
        } else {
          toast.success(`Sync complete! ${totalCount} accounts recovered. Please log in.`);
          setTimeout(() => router.push("/login"), 1500);
        }
      } else {
        setSyncStatus("Synchronization failed");
        toast.error(`Sync failed: ${result.error || "Unknown error"}`);
        setStep("cloud");
      }
    } catch (_err) {
      console.error("Sync error:", _err);
      setSyncStatus("Error during sync");
      toast.error("An unexpected error occurred during sync");
      setStep("cloud");
    }
  };

  const goBack = () => {
    const fromLogin = searchParams.get("from") === "login";
    if (fromLogin || onboardingStep === "welcome") {
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
      // Send the user to the login screen after restoring a local backup
      setTimeout(() => router.push("/login"), 1000);
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
    isCheckingStatus,
    syncProgress,
    syncStatus,
    setStep,
    handleRegister,
    handleCloudRestore,
    handleLocalRestore,
    goBack, isCloudLinked,
    existingStores,
    searchParams,
    showConfirmSwitch,
    setShowConfirmSwitch,
    pendingStoreName,
    confirmCloudRestoreSwitch,
    cancelCloudRestoreSwitch,
    cloudStores,
    selectedStoreId,
    setSelectedStoreId,
    handleSelectStoreConfirm,
  };
}
