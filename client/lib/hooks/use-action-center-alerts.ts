import React, { useMemo } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { useStore, type StoreProfile } from "@/lib/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { getStaffCount } from "@/lib/db/queries/auth";
import { getSyncQueueCount } from "@/lib/db/queries/setup";
import { checkLicenseStatus } from "@/lib/licensing/licensing-manager";
import { isTauri } from "@/lib/db/core";
import { isStandalonePwa } from "@/lib/utils/platform";
import { useWidgetPinPrompt } from "@/lib/hooks/use-widget-pin-prompt";
import {
  CloudOff,
  UserPlus,
  Settings,
  PackageX,
  Clock,
  RefreshCw,
  ShieldAlert,
  Download,
  AlertOctagon,
  LayoutGrid,
} from "lucide-react";
import { pluralize } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";

export type AlertPriority = "critical" | "warning" | "info" | "success";

export interface AlertItem {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  priority: AlertPriority;
  actionLabel: string;
  // Exactly one of these is set: actionRoute navigates, onAction runs a
  // handler in place (e.g. triggering a native prompt) instead.
  actionRoute?: string;
  onAction?: () => void;
}

export function useActionCenterAlerts(
  expiringCount: number,
  lowStockCount: number,
  missingExpiryCount: number,
  oversoldCount: number,
) {
  const { isAuthenticated, isAdmin, user } = useAuth();
  const { storeProfile } = useStore();
  const isStoreOwner = user?.role === "store_owner";
  const { showWidgetPrompt, promptPinWidget } = useWidgetPinPrompt();

  const { data: staffCountData } = useQuery({
    ...queryKeys.staff.count(),
    queryFn: () => getStaffCount(),
  });

  const { data: pendingCountData } = useQuery({
    ...queryKeys.sync.queueCount(),
    queryFn: () => getSyncQueueCount(),
    refetchInterval: 5000,
  });

  const { data: licenseStatus } = useQuery({
    ...queryKeys.licensing.status(),
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
            actionRoute: "/settings/billing",
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
              actionRoute: "/settings/billing",
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
        const fieldsToCheck: (keyof StoreProfile)[] = ["name", "address", "phone", "email", "logo_url"];
        if (storeProfile.store_type === "pharmacy") {
          fieldsToCheck.push("pcn_license");
        }

        const filledFields = fieldsToCheck.filter(
          (field) => !!storeProfile[field],
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
          title: `${expiringCount} ${pluralize(expiringCount, "Item")} Expiring`,
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
          title: `${lowStockCount} ${pluralize(lowStockCount, "Item")} Low Stock`,
          description: "Below designated reorder level.",
          icon: PackageX,
          priority: "warning",
          actionLabel: "View Needs",
          actionRoute: "/inventory/catalog?status=low_stock",
        });
      }

      if (oversoldCount > 0) {
        items.push({
          id: "oversold",
          title: `${oversoldCount} ${pluralize(oversoldCount, "Item")} Oversold`,
          description: "Stock floored at zero — reconcile now.",
          icon: AlertOctagon,
          priority: "critical",
          actionLabel: "Reconcile Now",
          actionRoute: "/inventory/catalog?status=out_of_stock",
        });
      }

      if (missingExpiryCount > 0) {
        items.push({
          id: "missing-expiry",
          title: `${missingExpiryCount} ${pluralize(missingExpiryCount, "Batch", "Batches")} Missing Expiry`,
          description: "Update to maintain safety net.",
          icon: Clock,
          priority: "warning",
          actionLabel: "Update Now",
          actionRoute: "/inventory/overview", // Or a specific filtered view
        });
      }

      if (showWidgetPrompt && isAuthenticated) {
        items.push({
          id: "add-widget",
          title: "Add Home Screen Widget",
          description: "See today's sales at a glance.",
          icon: LayoutGrid,
          priority: "info",
          actionLabel: "Add Widget",
          onAction: promptPinWidget,
        });
      }

      if (isStoreOwner && !isTauri() && !isStandalonePwa()) {
        items.push({
          id: "get-the-app",
          title: "Get the App",
          description: "Install or download DumosRx for faster access.",
          icon: Download,
          priority: "info",
          actionLabel: "View Options",
          actionRoute: "/settings/system",
        });
      }

      if (pendingSyncCount > 0) {
        items.push({
          id: "pending-sync",
          title: `${pendingSyncCount} ${pluralize(pendingSyncCount, "Change")} Unsynced`,
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
    isStoreOwner,
    staffCount,
    pendingSyncCount,
    storeProfile,
    expiringCount,
    lowStockCount,
    missingExpiryCount,
    oversoldCount,
    licenseStatus,
    showWidgetPrompt,
    promptPinWidget,
  ]);

  return alerts;
}
