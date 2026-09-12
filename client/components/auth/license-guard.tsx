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
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
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

// Restricted mobile users may browse/navigate freely; only actions that
// create, update, or delete data are blocked. Detected by accessible-name
// keyword rather than by element type, since blocking every button/input
// (the old behavior) also blocked search boxes, filters, sort/pagination
// controls, and "view details" buttons — anything read-only.
const MUTATING_KEYWORDS = [
  "save",
  "create",
  "add",
  "delete",
  "remove",
  "update",
  "checkout",
  "check out",
  "pay",
  "confirm",
  "submit",
  "register",
  "restore",
  "void",
  "refund",
  "redeem",
  "apply",
  "post",
  "publish",
  "upload",
  "import",
  "adjust",
  "transfer",
  "receive",
  "return",
  "clock in",
  "clock out",
];
const MUTATING_KEYWORDS_RE = new RegExp(
  `\\b(${MUTATING_KEYWORDS.join("|")})\\b`,
  "i",
);

function getAccessibleName(el: Element): string {
  const aria = el.getAttribute("aria-label");
  const title = el.getAttribute("title");
  const value = el instanceof HTMLInputElement ? el.value : "";
  return `${el.textContent || ""} ${aria || ""} ${title || ""} ${value}`;
}

function isMutatingElement(el: Element | null): boolean {
  if (!el) return false;
  return MUTATING_KEYWORDS_RE.test(getAccessibleName(el));
}

function MobileRestrictionGuard() {
  const { canUseMobileApp } = useFeatureGate();
  const { isAuthenticated } = useAuth();
  const isLocked = useAutoLockStore((state) => state.isLocked);
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(isMobileDevice());
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);

    const isRestricted = () =>
      isMobile &&
      !canUseMobileApp &&
      isAuthenticated &&
      !isLocked &&
      pathname !== "/login";

    const block = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      toast.error("Mobile Access Locked", {
        description:
          "Please upgrade your plan to create, edit, or delete data on the mobile app.",
      });
    };

    // Feature usage interceptor: only mutating actions, never plain
    // navigation/viewing.
    const handleGlobalClick = (e: MouseEvent) => {
      if (!isRestricted()) return;

      const target = e.target as HTMLElement;

      // Allow our own banner to be clicked
      if (target.closest("#mobile-restriction-banner")) return;

      // Allow navigation and tabs
      if (target.closest('nav, aside, header, .sidebar, [role="tab"], a'))
        return;

      // Switches/checkboxes always commit a change on click (there's no
      // read-only use for one), unlike buttons/inputs which are often just
      // navigation or filtering, so these are blocked unconditionally
      // rather than relying on their label containing a mutating keyword.
      const toggleEl = target.closest(
        '[role="switch"], [role="checkbox"], input[type="checkbox"], input[type="radio"]',
      );
      if (toggleEl) {
        block(e);
        return;
      }

      const actionEl = target.closest(
        'button, [role="button"], input[type="submit"], input[type="button"]',
      );
      if (actionEl && isMutatingElement(actionEl)) {
        block(e);
      }
    };

    // Safety net for forms submitted via Enter key (no button click to
    // intercept): only blocks if the submitter itself reads as mutating, so
    // read-only forms (e.g. a search box wrapped in <form onSubmit>) still
    // work.
    const handleGlobalSubmit = (e: SubmitEvent) => {
      if (!isRestricted()) return;
      if ((e.target as HTMLElement)?.closest("#mobile-restriction-banner"))
        return;
      if (isMutatingElement(e.submitter)) {
        block(e);
      }
    };

    document.addEventListener("click", handleGlobalClick, { capture: true });
    document.addEventListener("submit", handleGlobalSubmit, {
      capture: true,
    });

    return () => {
      window.removeEventListener("resize", checkMobile);
      document.removeEventListener("click", handleGlobalClick, {
        capture: true,
      });
      document.removeEventListener("submit", handleGlobalSubmit, {
        capture: true,
      });
    };
  }, [isMobile, canUseMobileApp, isAuthenticated, isLocked, pathname]);

  return null;
}

export function LicenseGuard({ children }: { children: React.ReactNode }) {
  const { storeProfile } = useStore();
  const pathname = usePathname();
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState("DUMOS-OFFLINE-772X");

  const performCheck = async (trigger: string) => {
    // TEMP DIAGNOSTIC (remove once splashscreen-on-navigation is root-caused)
    console.log(`[LicenseGuard] performCheck start (trigger=${trigger}, pathname=${pathname})`);
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
    // TEMP DIAGNOSTIC (remove once splashscreen-on-navigation is root-caused)
    console.log(`[LicenseGuard] performCheck end (trigger=${trigger}, pathname=${pathname})`);
  };

  // Generate or load device ID on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDeviceId(getDeviceId());
    }
  }, []);

  // Reactive to local SQLite store profile status changes
  useEffect(() => {
    // TEMP DIAGNOSTIC (remove once splashscreen-on-navigation is root-caused)
    console.log("[LicenseGuard] status-effect fired", {
      status: storeProfile?.status,
      suspension_reason: storeProfile?.suspension_reason,
      subscription_tier: storeProfile?.subscription_tier,
    });
    performCheck("status-effect");
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
                onClick={() => performCheck("manual-button")}
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
              onClick={() => performCheck("manual-button")}
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
