"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LicenseBlockedCard } from "./license-blocked-card";
import { MobileRestrictionGuard } from "./mobile-restriction-guard";
import { getDeviceId } from "@/lib/utils/device-id";
import {
  checkLicenseStatus,
  LicenseInfo,
} from "@/lib/licensing/licensing-manager";


import { SplashScreen } from "@/components/ui/splash-screen";


import { useStore } from "@/lib/context/store-context";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { APP_EVENTS, onAppEvent } from "@/lib/events";
import { useHydrated } from "@/lib/hooks/use-hydrated";

function ThemeRestrictor() {
  const { currentTier } = useFeatureGate();
  const { theme, setTheme } = useTheme();
  const { storeProfile, updateStoreProfile } = useStore();

  useEffect(() => {
    if (currentTier === "free") {
      if (theme !== "light") {
        setTheme("light");
      }
      if (storeProfile && storeProfile.theme !== "default") {
        void updateStoreProfile({ theme: "default" });
      }
    }
  }, [currentTier, theme, storeProfile, setTheme, updateStoreProfile]);

  return null;
}

// Restricted mobile users may browse/navigate freely; only actions that create, update, or delete data are blocked.
// Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-license-guard-tsx-L41
export function LicenseGuard({ children }: { children: React.ReactNode }) {
  const { storeProfile, isSwitchingStore } = useStore();
  const pathname = usePathname();
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const hydrated = useHydrated();
  const deviceId = useMemo(
    () => (hydrated ? getDeviceId() : "DUMOS-OFFLINE-772X"),
    [hydrated],
  );
  const [clockNotice, setClockNotice] = useState<string | null>(null);
  // Bumped at the start of every performCheck() run so an overlapping earlier run (e.g.
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-license-guard-tsx-L53
  const checkGeneration = useRef(0);

  // Reads local state only: the launch sync is StoreProvider's and must
  // never gate first paint (see A-7 in docs/FIXED_BUGS.md).
  const readLocalLicense = useCallback(async (generation: number) => {
    // Re-read the local DB.
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-license-guard-tsx-L92
    let status: LicenseInfo | null = null;
    try {
      status = await checkLicenseStatus();
    } catch (err) {
      console.error("[LicenseGuard] checkLicenseStatus() threw:", err);
    }
    if (generation !== checkGeneration.current) return;
    if (status) setLicense(status);
    setLoading(false);
  }, []);

  const performCheck = useCallback(
    () => readLocalLicense(++checkGeneration.current),
    [readLocalLicense],
  );

  const recheckFromCloud = async () => {
    const generation = ++checkGeneration.current;

    if (typeof window !== "undefined" && navigator.onLine) {
      setLoading(true);
      // Only route out of a clock lock, and deliberately online-only:
      // Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-license-guard-tsx-L69
      try {
        const { reconcileClockWithServer } = await import("@/lib/licensing/licensing-manager");
        const outcome = await reconcileClockWithServer();
        setClockNotice(outcome.reconciled ? null : outcome.reason);
      } catch (e) {
        console.error("[LicenseGuard] Clock reconciliation failed:", e);
      }
      try {
        const { sync } = await import("@/lib/db/sync-engine");
        await Promise.race([
          sync(true),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("License sync timed out")), 5000),
          ),
        ]);
      } catch (e) {
        console.error("[LicenseGuard] Failed to sync on status refresh:", e);
      }
    }

    await readLocalLicense(generation);
  };

  // Catches a renewal that only moved the expiry date; the storeProfile
  // effect below catches a status/tier change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    return onAppEvent(APP_EVENTS.syncCompleted, () => {
      void performCheck();
    });
  }, [performCheck]);

  // Reactive to local SQLite store profile status changes
  useEffect(() => {
    void performCheck();
  }, [
    storeProfile?.status,
    storeProfile?.suspension_reason,
    storeProfile?.subscription_tier,
    performCheck,
  ]);

  // isSwitchingStore covers the store-switch transition:
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-license-guard-tsx-L140
  if (loading || isSwitchingStore) {
    return <SplashScreen />;
  }

  // Renewing/paying must always be reachable no matter the license state -- otherwise a suspended or clock-tampered lock scr…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-license-guard-tsx-L150
  if (pathname === "/settings/billing") {
    return <>{children}</>;
  }

  // Render children for valid licenses OR expired subscriptions (downgraded to free).
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-license-guard-tsx-L159
  const isSuspended = license?.isSuspended || false;

  const isExpiredSub =
    !license?.isValid && !license?.isClockTampered && !isSuspended;

  if (license?.isValid || isExpiredSub) {
    return (
      <>
        <ThemeRestrictor />
        <MobileRestrictionGuard />
        {children}
      </>
    );
  }

  return (
    <LicenseBlockedCard
      license={license}
      deviceId={deviceId}
      clockNotice={clockNotice}
      isSuspended={isSuspended}
      onRecheck={() => void recheckFromCloud()}
    />
  );
}
