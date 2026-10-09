"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LicenseBlockedCard } from "./license-blocked-card";
import { MobileRestrictionGuard } from "./mobile-restriction-guard";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { getDeviceId } from "@/lib/utils/device-id";
import {
  checkLicenseStatus,
  LicenseInfo,
} from "@/lib/licensing/licensing-manager";
import {
  AlertOctagon,
  RefreshCw,
  Clock,
  Lock,
  ExternalLink,
} from "lucide-react";
import { SplashScreen } from "@/components/ui/splash-screen";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { isNativeMobileApp } from "@/lib/utils";
import { toast } from "sonner";
import { APP_EVENTS, onAppEvent } from "@/lib/events";

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

// Restricted mobile users may browse/navigate freely; only actions that
// create, update, or delete data are blocked. Detected by accessible-name
// keyword rather than by element type, since blocking every button/input
// (the old behavior) also blocked search boxes, filters, sort/pagination
// controls, and "view details" buttons — anything read-only.
export function LicenseGuard({ children }: { children: React.ReactNode }) {
  const { storeProfile, isSwitchingStore } = useStore();
  const pathname = usePathname();
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState("DUMOS-OFFLINE-772X");
  const [clockNotice, setClockNotice] = useState<string | null>(null);
  // Bumped at the start of every performCheck() run so an overlapping
  // earlier run (e.g. a storeProfile change firing again while a prior
  // run's sync-timeout race is still resolving) can tell it's stale once it
  // finally settles, instead of clobbering a newer run's `loading`/`license`
  // state with its own now-outdated result.
  const checkGeneration = useRef(0);

  // Reads local state only: the launch sync is StoreProvider's and must
  // never gate first paint (see A-7 in docs/FIXED_BUGS.md).
  const performCheck = useCallback(async (
    options: { refreshFromCloud?: boolean } = {},
  ) => {
    const generation = ++checkGeneration.current;

    if (options.refreshFromCloud && typeof window !== "undefined" && navigator.onLine) {
      setLoading(true);
      // Only route out of a clock lock, and deliberately online-only: the
      // watermark is device-local, so neither sync nor a factory reset can
      // repair it (A-191).
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

    // Re-read the local DB. Guarded: checkLicenseStatus()
    // does a local write of its own (updateStoreMonotonicTime), which
    // throws on a read-only tab (see tab-lock.ts / C1 in docs/KNOWN_BUGS.md)
    // - previously uncaught here, so the whole async function rejected
    // before reaching setLoading(false), leaving `loading` true forever and
    // SplashScreen stuck on screen permanently. On failure, `license` is
    // left as whatever it already was (null on first mount, unchanged on a
    // "Check Again" retry) rather than reset - a transient failure must
    // never regress an already-valid session into the locked-out branch
    // below, and a null license already fails open into isExpiredSub rather
    // than hard-locking on an unproven failure.
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

  // Catches a renewal that only moved the expiry date; the storeProfile
  // effect below catches a status/tier change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    return onAppEvent(APP_EVENTS.syncCompleted, () => {
      void performCheck();
    });
  }, [performCheck]);

  // Generate or load device ID on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDeviceId(getDeviceId());
    }
  }, []);

  // Reactive to local SQLite store profile status changes
  useEffect(() => {
    void performCheck();
  }, [
    storeProfile?.status,
    storeProfile?.suspension_reason,
    storeProfile?.subscription_tier,
    performCheck,
  ]);

  // isSwitchingStore covers the store-switch transition: switchStore()
  // clears the query cache so the remount below finds nothing stale to
  // serve, but that clear takes a moment (cancel in-flight fetches, then
  // clear()). Showing the splash for that window means a switch can never
  // flash the outgoing store's dashboard. (See switchStore() in
  // store-context.tsx.)
  if (loading || isSwitchingStore) {
    return <SplashScreen />;
  }

  // Renewing/paying must always be reachable no matter the license state --
  // otherwise a suspended or clock-tampered lock screen (whose own "Renew
  // Subscription" button just navigates here) could permanently strand the
  // user on this exact page. Always let the billing page's own children
  // through, skipping the lock screen entirely.
  if (pathname === "/settings/billing") {
    return <>{children}</>;
  }

  // Render children for valid licenses OR expired subscriptions (downgraded to free).
  // Only hard-block on suspension or clock tampering.
  // Branching is driven by LicenseInfo.isSuspended (derived from the store's
  // real status), never by the message text — that's display copy only, so
  // rewording it must not silently flip a suspended account into the
  // "Subscription Expired"/"Renew" path.
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
      onRecheck={() => void performCheck({ refreshFromCloud: true })}
    />
  );
}
