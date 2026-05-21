"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { query, execute, generateId } from "@/lib/db/local-database";
import { sync } from "@/lib/db/sync-engine";
import { toast } from "sonner";

export type OnboardingStep = "welcome" | "register" | "cloud" | "backup" | "syncing";

export function useOnboarding() {
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("welcome");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState("Initializing sync...");
  const [existingStores, setExistingStores] = useState<any[]>([]);

  const { login, linkCloudAccount, isCloudLinked } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const step = searchParams.get("step") as OnboardingStep;
    if (step && ["welcome", "register", "cloud", "backup", "syncing"].includes(step)) {
      setOnboardingStep(step);
    } else {
      setOnboardingStep("welcome");
    }
    checkStatus();
  }, [searchParams]);

  const checkStatus = async () => {
    try {
      const tables = await query<any>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
      );
      if (tables.length > 0) {
        const result = await query<any>(
          "SELECT COUNT(*) as count FROM users WHERE is_active = 1",
        );
        const count = result[0]?.count || 0;
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

  const handleRegister = async (name: string, username: string, pin: string, storeName: string, existingStoreId?: string) => {
    setIsLoading(true);
    try {
      const userId = generateId();
      const storeId = existingStoreId || generateId();
      const now = new Date().toISOString();

      // 1. Create or update the store profile
      if (!existingStoreId) {
        await execute(
          "INSERT INTO store_profile (id, name, is_initialized, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?)",
          [storeId, storeName, 1, now, now, 0],
        );
      } else {
        await execute(
          "UPDATE store_profile SET name = ?, is_initialized = 1, updated_at = ? WHERE id = ?",
          [storeName, now, storeId],
        );
      }

      // 2. Create the administrator account
      await execute(
        "INSERT INTO users (id, name, username, pin, role, store_id, is_active, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [userId, name, username, pin, "admin", storeId, 1, now, now, 0],
      );

      toast.success(`${storeName} configured and administrator created!`);
      
      // 3. Login locally
      const success = await login(username, pin);
      
      if (success) {
        // 4. If cloud is linked, trigger an initial sync to push the new administrator
        if (isCloudLinked) {
            toast.info("Pushing your account to cloud...");
            sync().catch(console.error);
        }
        router.push("/dashboard");
      }
    } catch (_err) {
      console.error("Registration failed", err);
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
        setStep("syncing");
        startSyncProcess();
      } else {
        toast.error(result.message);
      }
    } catch (_err) {
      toast.error("Cloud connection failed");
    } finally {
      setIsLoading(false);
    }
  };

  const startSyncProcess = async () => {
    try {
      setSyncProgress(10);
      setSyncStatus("Connecting to cloud storage...");
      await new Promise((r) => setTimeout(r, 800));
      
      setSyncProgress(30);
      setSyncStatus("Preparing data migration...");
      
      const result = await sync();
      
      if (result.success) {
        setSyncProgress(80);
        setSyncStatus("Verifying synced records...");
        
        // Verify we actually have users in the synced data
        const users = await query<any>("SELECT COUNT(*) as count FROM users WHERE _deleted = 0");
        const userCount = users[0]?.count || 0;

        await new Promise((r) => setTimeout(r, 1000));
        
        if (userCount === 0) {
          // Check for existing stores in store_profile
          const stores = await query<any>("SELECT id, name FROM store_profile WHERE _deleted = 0");
          setExistingStores(stores);
          
          setSyncStatus("No account data found");
          toast.warning("Synchronization finished, but no staff accounts were found. Let's set up your local account.");
          
          await new Promise((r) => setTimeout(r, 1500));
          setStep("register");
          return;
        }

        setSyncProgress(100);
        setSyncStatus("Sync complete!");
        toast.success(`Sync complete! ${userCount} accounts recovered. Please log in.`);
        setTimeout(() => router.push("/login"), 1500);
      } else {
        setSyncStatus("Synchronization failed");
        toast.error(`Sync failed: ${result.error || "Unknown error"}`);
        setStep("cloud");
      }
    } catch (_err) {
      console.error("Sync error:", err);
      setSyncStatus("Error during sync");
      toast.error("An unexpected error occurred during sync");
      setStep("cloud");
    }
  };

  const goBack = () => {
    const fromLogin = searchParams.get("from") === "login";
    if (fromLogin || onboardingStep === "welcome") {
      router.push("/login");
    } else {
      setStep("welcome");
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
    goBack, isCloudLinked,
    existingStores,
    searchParams,
  };
}
