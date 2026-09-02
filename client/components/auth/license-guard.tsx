"use client";

import { useEffect, useState } from "react";
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
import { isMobileDevice } from "@/lib/utils";
import { toast } from "sonner";

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
        updateStoreProfile({ theme: "default" });
      }
    }
  }, [currentTier, theme, storeProfile, setTheme, updateStoreProfile]);

  return null;
}

function MobileRestrictionGuard() {
  const { canUseMobileApp } = useFeatureGate();
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(isMobileDevice());
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);

    // Feature usage interceptor
    const handleGlobalClick = (e: MouseEvent) => {
      if (
        !isMobile ||
        canUseMobileApp ||
        !isAuthenticated ||
        pathname === "/login"
      ) {
        return;
      }

      const target = e.target as HTMLElement;

      // Allow our own banner to be clicked
      if (target.closest("#mobile-restriction-banner")) return;

      // Allow navigation and tabs
      if (target.closest('nav, aside, header, .sidebar, [role="tab"], a'))
        return;

      // Intercept action elements
      const isAction = target.closest(
        'button, input, textarea, select, [role="switch"], [role="checkbox"]',
      );
      if (isAction) {
        e.preventDefault();
        e.stopPropagation();

        toast.error("Mobile Access Locked", {
          description:
            "Please upgrade your plan to perform actions on the mobile app.",
        });
      }
    };

    document.addEventListener("click", handleGlobalClick, { capture: true });

    return () => {
      window.removeEventListener("resize", checkMobile);
      document.removeEventListener("click", handleGlobalClick, {
        capture: true,
      });
    };
  }, [isMobile, canUseMobileApp, isAuthenticated, pathname]);

  return null;
}

export function LicenseGuard({ children }: { children: React.ReactNode }) {
  const { storeProfile } = useStore();
  const pathname = usePathname();
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState("DUMOS-OFFLINE-772X");

  const performCheck = async () => {
    setLoading(true);

    if (typeof window !== "undefined" && navigator.onLine) {
      try {
        // Force a full cloud sync so any recent subscription renewals are
        // pulled down and written to the local stores table before we
        // re-evaluate the license locally.
        const { sync } = await import("@/lib/db/sync-engine");
        await sync(true);
      } catch (e) {
        console.error("[LicenseGuard] Failed to sync on status refresh:", e);
      }
    }

    // Re-read the (now refreshed) local DB
    const status = await checkLicenseStatus();
    setLicense(status);
    setLoading(false);
  };

  // Generate or load device ID on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDeviceId(getDeviceId());
    }
  }, []);

  // Reactive to local SQLite store profile status changes
  useEffect(() => {
    performCheck();
  }, [
    storeProfile?.status,
    storeProfile?.suspension_reason,
    storeProfile?.subscription_tier,
  ]);

  if (loading) {
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
  const isExpiredSub =
    !license?.isValid &&
    !license?.isClockTampered &&
    !license?.message?.includes("suspended");

  if (license?.isValid || isExpiredSub) {
    return (
      <>
        <ThemeRestrictor />
        <MobileRestrictionGuard />
        {children}
      </>
    );
  }

  const isSuspended = license?.message?.includes("suspended") || false;

  // If clock is tampered or license expired/suspended, show lock screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
      <Card className="max-w-md w-full border-destructive/50 shadow-2xl shadow-destructive/10">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
            {!!(license?.isClockTampered) && (
                                    <Clock className="h-8 w-8" />
                                  )}
                      {!(license?.isClockTampered) && (
                                    <Lock className="h-8 w-8" />
                                  )}
          </div>
          <CardTitle className="text-2xl font-black">
            {!!(license?.isClockTampered) && "Clock Discrepancy"}
                      {!!(!(license?.isClockTampered) && isSuspended) && "Account Suspended"}
                      {!(!(license?.isClockTampered) && isSuspended) && "Subscription Expired"}
          </CardTitle>
          <CardDescription>{license?.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg text-sm">
            <p className="flex items-center gap-2 font-bold text-muted-foreground mb-1 uppercase tracking-widest text-[10px]">
              <AlertOctagon className="h-3 w-3" />
              Technical Details
            </p>
            <p>Device ID: {deviceId}</p>
            {license?.expiryDate && (
              <p>Last Valid Date: {formatDateToDDMMYYYY(license.expiryDate)}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {!isSuspended && (
            <>
              <Button
                className="w-full bg-accent hover:bg-accent/90 font-bold"
                onClick={performCheck}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Again
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  window.location.href = "/settings/billing";
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Renew Subscription
              </Button>
            </>
          )}
          {isSuspended && (
            <Button
              className="w-full bg-accent hover:bg-accent/90 font-bold"
              onClick={performCheck}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Account Status
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
