"use client";

import { useEffect } from "react";
import { getSystemConfig, setSystemConfig } from "@/lib/db/core";
import { useSystemConfigStore } from "@/lib/store/system-config-store";
import { apiClient } from "@/lib/api";

export function SystemConfigLoader() {
  const { setSubscriptionPlans, setLoadedFromDB } = useSystemConfigStore();

  useEffect(() => {
    let mounted = true;

    async function loadConfigs() {
      // 1. Fast load from SQLite first to instantly hydrate UI
      try {
        const localPlans = await getSystemConfig("subscription_plans");
        if (mounted && localPlans) {
          setSubscriptionPlans(localPlans);
        }
      } catch (err) {
        console.warn("Failed to load local system config:", err);
      } finally {
        if (mounted) setLoadedFromDB(true);
      }

      // 2. Background fetch from server to get latest truth
      try {
        const remotePlans = await apiClient.getSystemConfig("subscription_plans");
        if (remotePlans && mounted) {
          setSubscriptionPlans(remotePlans);
          // 3. Save it back to local SQLite for next time
          await setSystemConfig("subscription_plans", remotePlans);
        }
      } catch (err) {
        console.warn("Failed to sync system config from server (likely offline):", err);
      }
    }

    loadConfigs();

    return () => {
      mounted = false;
    };
  }, [setSubscriptionPlans, setLoadedFromDB]);

  return null; // Invisible component
}
