"use client";

import { useEffect, useState } from "react";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
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
import { WEB_APP_DASHBOARD_URL } from "@/lib/constants";
import { useTheme } from "@/components/theme-provider";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { isMobileDevice } from "@/lib/utils";
import { WEB_APP_URL } from "@/lib/constants";
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
  const { canUseMobileApp, getUpgradeMessage } = useFeatureGate();
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
        pathname === "/login" ||
        pathname === "/setup"
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

  const openBilling = async () => {
    const url = `${WEB_APP_URL}/dashboard/billing`;
    try {
      if ((window as any).__TAURI_INTERNALS__) {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (_e) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  if (
    isMobile &&
    !canUseMobileApp &&
    isAuthenticated &&
    pathname !== "/login" &&
    pathname !== "/setup"
  ) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 pointer-events-none">
        <Card
          id="mobile-restriction-banner"
          className="max-w-md mx-auto w-full border-border/40 shadow-2xl bg-card text-card-foreground pointer-events-auto"
        >
          <CardHeader className="pb-2 flex flex-row items-start gap-4 space-y-0">
            <div className="w-10 h-10 bg-destructive/10 text-destructive rounded-full flex shrink-0 items-center justify-center">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold font-serif tracking-tight">
                📱 Mobile Access Locked
              </CardTitle>
              <CardDescription className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {getUpgradeMessage(
                  "mobile_access",
                  "Mobile access is a premium feature. Please upgrade your plan to access your dashboard on the go.",
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardFooter className="pt-2 pb-4">
            <Button
              className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-bold shadow-md shadow-primary/20 h-10"
              onClick={openBilling}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Upgrade Plan
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return null;
}

export function LicenseGuard({ children }: { children: React.ReactNode }) {
  const { storeProfile } = useStore();
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState("DUMOS-OFFLINE-772X");

  const performCheck = async () => {
    setLoading(true);

    // Sync status with server first if online
    if (typeof window !== "undefined" && navigator.onLine) {
      try {
        const { sync } = await import("@/lib/db/sync-engine");
        await sync(true);
      } catch (e) {
        console.error("[LicenseGuard] Failed to sync on status refresh:", e);
      }
    }

    const status = await checkLicenseStatus();
    setLicense(status);
    setLoading(false);
  };

  // Generate or load device ID on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      let id = localStorage.getItem("dumos_device_id");
      if (!id) {
        id = "DRX-" + Math.random().toString(36).substring(2, 11).toUpperCase();
        localStorage.setItem("dumos_device_id", id);
      }
      setDeviceId(id);
    }
  }, []);

  // Reactive to local SQLite store profile status changes
  useEffect(() => {
    performCheck();
  }, [storeProfile?.status, storeProfile?.suspension_reason]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <RefreshCw className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  // If license is valid, render children
  if (license?.isValid) {
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
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4">
      <Card className="max-w-md w-full border-destructive/50 shadow-2xl shadow-destructive/10">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
            {license?.isClockTampered ? (
              <Clock className="h-8 w-8" />
            ) : (
              <Lock className="h-8 w-8" />
            )}
          </div>
          <CardTitle className="text-2xl font-black">
            {license?.isClockTampered
              ? "Clock Discrepancy"
              : isSuspended
                ? "Account Suspended"
                : "Subscription Expired"}
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
              <Button variant="outline" className="w-full" asChild>
                <a
                  href={`${WEB_APP_DASHBOARD_URL}/billing`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Renew Subscription
                </a>
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
