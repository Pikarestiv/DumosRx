"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { getStaffCount } from "@/lib/db/queries/auth";
import {
  CloudOff,
  UserPlus,
  Settings,
  BellRing,
  PackageX,
  Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface ActionCenterProps {
  expiringCount: number;
  lowStockCount: number;
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
function useActionCenterAlerts(expiringCount: number, lowStockCount: number) {
  const { isAuthenticated, isAdmin } = useAuth();
  const { storeProfile } = useStore();

  const { data: staffCountData } = useQuery({
    queryKey: ["staffCount"],
    queryFn: () => getStaffCount(),
  });

  const staffCount = staffCountData || 0;

  const alerts = useMemo(() => {
    const items: AlertItem[] = [];

    if (isAdmin) {
      if (!isAuthenticated) {
        items.push({
          id: "cloud-sync",
          title: "No Cloud Account Linked",
          description:
            "Link to DumosRx Cloud to enable backups and remote sync.",
          icon: CloudOff,
          priority: "critical",
          actionLabel: "Link Account",
          actionRoute: "/settings/cloud",
        });
      }

      if (staffCount === 0) {
        items.push({
          id: "no-staff",
          title: "No Staff Accounts Found",
          description:
            "Create staff PINs so your cashiers can log in to the POS.",
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
            title: `Store Profile is ${percentage}% Complete`,
            description:
              "Complete your profile to ensure your receipts look professional.",
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
          description:
            "Please configure your business details and terminology.",
          icon: Settings,
          priority: "critical",
          actionLabel: "Setup Now",
          actionRoute: "/settings/store",
        });
      }

      if (expiringCount > 0) {
        items.push({
          id: "expiring-soon",
          title: `${expiringCount} Items Expiring Soon`,
          description: "Review your stock batches to discount or remove items.",
          icon: Clock,
          priority: "warning",
          actionLabel: "Check Now",
          actionRoute: "/inventory/batches",
        });
      }

      if (lowStockCount > 0) {
        items.push({
          id: "low-stock",
          title: `${lowStockCount} Items Low on Stock`,
          description:
            "You have products below their designated reorder level.",
          icon: PackageX,
          priority: "warning",
          actionLabel: "View Needs",
          actionRoute: "/inventory/products?status=low_stock",
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
    storeProfile,
    expiringCount,
    lowStockCount,
  ]);

  return alerts;
}

// --- Extracted Component for Alert Card ---
const getPriorityColors = (priority: AlertPriority) => {
  switch (priority) {
    case "critical":
      return "bg-destructive/10 border-destructive/20 text-destructive";
    case "warning":
      return "bg-amber-500/10 border-amber-500/20 text-amber-500 dark:bg-amber-500/20";
    case "info":
      return "bg-primary/10 border-primary/20 text-primary";
    case "success":
      return "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 dark:bg-emerald-500/20";
  }
};

function ActionCenterCard({ alert }: { alert: AlertItem }) {
  const router = useRouter();

  return (
    <Card
      className={`border-border bg-card shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col justify-between h-full group ${getPriorityColors(alert.priority).split(' ')[0].replace('/10', '/5')}`}
      onClick={() => router.push(alert.actionRoute)}
    >
      <div className="p-3 sm:p-4 flex flex-col gap-2 h-full">
        <div className="flex items-center justify-between">
          <div
            className={`p-2 rounded-lg shrink-0 ${getPriorityColors(alert.priority)}`}
          >
            <alert.icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </div>
        <div className="flex-1 mt-1">
          <h4 className="font-bold text-xs sm:text-sm text-foreground line-clamp-1">
            {alert.title}
          </h4>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
            {alert.description}
          </p>
        </div>
        <div className="mt-2 text-[10px] sm:text-xs font-bold text-primary group-hover:underline">
          {alert.actionLabel} &rarr;
        </div>
      </div>
    </Card>
  );
}

// --- Main Container Component ---
export function DashboardActionCenter({
  expiringCount,
  lowStockCount,
}: ActionCenterProps) {
  const alerts = useActionCenterAlerts(expiringCount, lowStockCount);
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
        <BellRing className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm text-foreground">Action Center</h3>
        {alerts.length > 0 && (
          <span className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded-full ml-1">
            {alerts.length} Items
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {alerts.map((alert) => (
          <ActionCenterCard
            key={alert.id}
            alert={alert}
          />
        ))}
      </div>
    </div>
  );
}
