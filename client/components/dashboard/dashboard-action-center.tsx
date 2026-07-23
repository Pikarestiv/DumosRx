"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { getStaffCount } from "@/lib/db/queries/auth";
import { getSyncQueueCount } from "@/lib/db/queries/setup";
import { checkLicenseStatus } from "@/lib/licensing/licensing-manager";
import {
  CloudOff,
  UserPlus,
  Settings,
  BellRing,
  PackageX,
  Clock,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Card } from "@/components/ui/card";

export interface ActionCenterProps {
  expiringCount: number;
  lowStockCount: number;
  missingExpiryCount: number;
}

type AlertPriority = "critical" | "warning" | "info" | "success";

interface AlertItem {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  priority: AlertPriority;
  actionLabel: string;
  actionRoute: string;
}

// --- Extracted Hook for Logic ---
function useActionCenterAlerts(
  expiringCount: number,
  lowStockCount: number,
  missingExpiryCount: number,
) {
  const { isAuthenticated, isAdmin } = useAuth();
  const { storeProfile } = useStore();

  const { data: staffCountData } = useQuery({
    queryKey: ["staffCount"],
    queryFn: () => getStaffCount(),
  });

  const { data: pendingCountData } = useQuery({
    queryKey: ["syncQueueCount"],
    queryFn: () => getSyncQueueCount(),
    refetchInterval: 5000,
  });

  const { data: licenseStatus } = useQuery({
    queryKey: ["licenseStatus"],
    queryFn: () => checkLicenseStatus(),
    refetchInterval: 5 * 60 * 1000, // 5 mins
  });

  const staffCount = staffCountData || 0;
  const pendingSyncCount = pendingCountData || 0;

  const alerts = useMemo(() => {
    const items: AlertItem[] = [];

    if (isAdmin) {
      if (!isAuthenticated) {
        items.push({
          id: "cloud-sync",
          title: "No Cloud Account",
          description: "Enable backups and remote sync.",
          icon: CloudOff,
          priority: "critical",
          actionLabel: "Link Account",
          actionRoute: "/settings/cloud",
        });
      }

      if (
        licenseStatus &&
        (licenseStatus.tier !== "free" || licenseStatus.isTrial)
      ) {
        if (!licenseStatus.isValid && licenseStatus.tier !== "free") {
          items.push({
            id: "subscription-expired",
            title: "Subscription Expired",
            description: "Renew to continue syncing your data.",
            icon: ShieldAlert,
            priority: "critical",
            actionLabel: "Renew Now",
            actionRoute: "/settings/cloud",
          });
        } else if (licenseStatus.expiryDate) {
          const daysLeft = Math.floor(
            (new Date(licenseStatus.expiryDate).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          );
          const isTrial = licenseStatus.isTrial;
          if (isTrial || (daysLeft < 7 && licenseStatus.tier !== "free")) {
            items.push({
              id: "subscription-expiring",
              title: isTrial
                ? `Trial (${daysLeft} Days Left)`
                : `Expiring (${daysLeft} Days Left)`,
              description: "Renew to ensure uninterrupted cloud access.",
              icon: ShieldAlert,
              priority: "warning",
              actionLabel: "Renew Now",
              actionRoute: "/settings/cloud",
            });
          }
        }
      }

      if (staffCount === 0) {
        items.push({
          id: "no-staff",
          title: "No Staff Accounts",
          description: "Create staff PINs for POS access.",
          icon: UserPlus,
          priority: "critical",
          actionLabel: "Create Staff",
          actionRoute: "/settings/staff",
        });
      }

      if (storeProfile) {
        const fieldsToCheck = ["name", "address", "phone", "email", "logo_url"];
        if (storeProfile.store_type === "pharmacy") {
          fieldsToCheck.push("pcn_license");
        }

        const filledFields = fieldsToCheck.filter(
          (field) => !!(storeProfile as any)[field],
        );
        const percentage = Math.round(
          (filledFields.length / fieldsToCheck.length) * 100,
        );

        if (percentage < 100) {
          items.push({
            id: "profile-incomplete",
            title: `Profile ${percentage}% Complete`,
            description: "Ensure professional receipts.",
            icon: Settings,
            priority: "info",
            actionLabel: "Complete Now",
            actionRoute: "/settings/store",
          });
        }
      } else {
        items.push({
          id: "profile-missing",
          title: `Store Setup Required`,
          description: "Configure business details.",
          icon: Settings,
          priority: "critical",
          actionLabel: "Setup Now",
          actionRoute: "/settings/store",
        });
      }

      if (expiringCount > 0) {
        items.push({
          id: "expiring-soon",
          title: `${expiringCount} Items Expiring`,
          description: "Discount or remove items.",
          icon: Clock,
          priority: "warning",
          actionLabel: "Check Now",
          actionRoute: "/inventory/batches",
        });
      }

      if (lowStockCount > 0) {
        items.push({
          id: "low-stock",
          title: `${lowStockCount} Items Low Stock`,
          description: "Below designated reorder level.",
          icon: PackageX,
          priority: "warning",
          actionLabel: "View Needs",
          actionRoute: "/inventory/products?status=low_stock",
        });
      }

      if (missingExpiryCount > 0) {
        items.push({
          id: "missing-expiry",
          title: `${missingExpiryCount} Batches Missing Expiry`,
          description: "Update to maintain safety net.",
          icon: Clock,
          priority: "warning",
          actionLabel: "Update Now",
          actionRoute: "/inventory/overview", // Or a specific filtered view
        });
      }

      if (pendingSyncCount > 0) {
        items.push({
          id: "pending-sync",
          title: `${pendingSyncCount} Changes Unsynced`,
          description: "Sync to cloud to backup safely.",
          icon: RefreshCw,
          priority: "warning", // or info depending on severity
          actionLabel: "Sync Status",
          actionRoute: "/settings/cloud",
        });
      }
    }

    const priorityWeights = { critical: 3, warning: 2, info: 1, success: 0 };
    return items.sort(
      (a, b) => priorityWeights[b.priority] - priorityWeights[a.priority],
    );
  }, [
    isAuthenticated,
    isAdmin,
    staffCount,
    pendingSyncCount,
    storeProfile,
    expiringCount,
    lowStockCount,
    missingExpiryCount,
    licenseStatus,
  ]);

  return alerts;
}

// --- Card Item Component ---
function ActionCenterCard({ alert }: { alert: AlertItem }) {
  const router = useRouter();
  const Icon = alert.icon;

  const bgStyles = {
    critical: "bg-destructive/10 border-destructive/20 text-destructive",
    warning: "bg-orange-500/10 border-orange-500/20 text-orange-600",
    info: "bg-blue-500/10 border-blue-500/20 text-blue-600",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  };

  return (
    <Card
      onClick={() => router.push(alert.actionRoute)}
      className={`w-full h-[96px] border cursor-pointer hover:shadow-md transition-shadow duration-200 group relative overflow-hidden flex flex-col justify-center ${bgStyles[alert.priority]}`}
    >
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent dark:from-black/20 pointer-events-none" />

      <div className="p-3 sm:p-4 relative z-10 flex flex-col h-full justify-center">
        <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-3">
          <div
            className={`p-2 rounded-xl shrink-0 bg-background/50 shadow-sm backdrop-blur-sm ${bgStyles[alert.priority]}`}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-[13px] sm:text-sm text-foreground line-clamp-2 sm:line-clamp-1 leading-tight">
              {alert.title}
            </h4>
            <p className="hidden sm:block text-[11px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
              {alert.description}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

// --- Main Container Component ---
export function DashboardActionCenter({
  expiringCount,
  lowStockCount,
  missingExpiryCount,
}: ActionCenterProps) {
  const alerts = useActionCenterAlerts(
    expiringCount,
    lowStockCount,
    missingExpiryCount,
  );
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll logic for horizontal list
  useEffect(() => {
    if (alerts.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      if (scrollRef.current) {
        const container = scrollRef.current;
        const scrollWidth = container.scrollWidth;
        const clientWidth = container.clientWidth;

        let newScrollLeft = container.scrollLeft + clientWidth * 0.85;
        if (newScrollLeft >= scrollWidth - clientWidth + 10) {
          // Reset to start if at the end
          newScrollLeft = 0;
        }
        container.scrollTo({ left: newScrollLeft, behavior: "smooth" });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [alerts.length, isPaused]);

  if (alerts.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <BellRing className="h-4 w-4 text-foreground" />
        <h3 className="font-bold text-sm text-foreground">Action Center</h3>
        {alerts.length > 0 && (
          <span className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded-full ml-1">
            {alerts.length} Items
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pb-2"
      >
        {alerts.map((alert) => (
          <div key={alert.id} className="w-full">
            <ActionCenterCard alert={alert} />
          </div>
        ))}
      </div>
    </div>
  );
}
