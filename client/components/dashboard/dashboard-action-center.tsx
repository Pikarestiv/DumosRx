"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Timer,
  ShieldOff,
  UserX,
  Store,
  PackageSearch,
  Siren,
  CalendarClock,
  CalendarX,
  Smartphone,
  CloudUpload,
  CloudOff,
  Download,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  useActionCenterAlerts,
  type AlertItem,
} from "@/lib/hooks/use-action-center-alerts";

// A larger, more evocative icon per alert type for the card's background
// decoration — deliberately distinct from the small corner badge icon
// (use-action-center-alerts.ts's `icon`), which stays generic/consistent
// across priorities. Falls back to the alert's own icon for any id not
// listed here, so a future alert type never renders without a backdrop.
const BACKDROP_ICONS: Record<string, React.ElementType> = {
  "cloud-sync": CloudOff,
  "subscription-expired": ShieldOff,
  "subscription-expiring": Timer,
  "no-staff": UserX,
  "profile-incomplete": Store,
  "profile-missing": Store,
  "expiring-soon": CalendarClock,
  "low-stock": PackageSearch,
  oversold: Siren,
  "missing-expiry": CalendarX,
  "add-widget": Smartphone,
  "get-the-app": Download,
  "pending-sync": CloudUpload,
};

export interface ActionCenterProps {
  expiringCount: number;
  lowStockCount: number;
  missingExpiryCount: number;
  oversoldCount: number;
}

// --- Card Item Component ---
function ActionCenterCard({ alert }: { alert: AlertItem }) {
  const router = useRouter();
  const Icon = alert.icon;
  const BackdropIcon = BACKDROP_ICONS[alert.id] ?? alert.icon;

  // Split from a single combined string (A-158): a bg-*/10 tint passed into
  // Card's own className replaced its opaque bg-card background outright via
  // Tailwind class-merging, rather than layering on top of it, leaving the
  // card with no solid surface - just a translucent tint over whatever's
  // behind it (invisible on a browser without color-mix() support, per the
  // compat shim in app/globals.css). The tint now lives on its own overlay
  // div, on top of an explicit bg-card base, instead of inside Card's own
  // background-color slot.
  const tintStyles = {
    critical: "bg-destructive/10",
    warning: "bg-orange-500/10",
    info: "bg-blue-500/10",
    success: "bg-emerald-500/10",
  };
  const surfaceStyles = {
    critical: "border-destructive/20 text-destructive",
    warning: "border-orange-500/20 text-orange-600",
    info: "border-blue-500/20 text-blue-600",
    success: "border-emerald-500/20 text-emerald-600",
  };

  return (
    <Card
      onClick={() => {
        if (alert.onAction) {
          alert.onAction();
        } else if (alert.actionRoute) {
          router.push(alert.actionRoute);
        }
      }}
      className={`w-full h-[80px] border cursor-pointer hover:shadow-md transition-shadow duration-200 group relative overflow-hidden flex flex-col justify-center ${surfaceStyles[alert.priority]}`}
    >
      {/* Decorative priority tint, on top of Card's own opaque bg-card */}
      <div className={`absolute inset-0 ${tintStyles[alert.priority]} pointer-events-none`} />

      {/* Decorative backdrop icon, per alert type */}
      <BackdropIcon className="absolute -right-3 -bottom-3 h-16 w-16 opacity-10 group-hover:opacity-15 transition-opacity pointer-events-none" />

      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent dark:from-black/20 pointer-events-none" />

      <div className="px-3 py-2 sm:px-4 sm:py-2.5 relative z-10 flex flex-col h-full justify-center">
        <div className="flex flex-col sm:flex-row items-start gap-2 sm:gap-3">
          <div
            className={`p-2 rounded-xl shrink-0 bg-background/50 shadow-sm backdrop-blur-sm ${tintStyles[alert.priority]} ${surfaceStyles[alert.priority]}`}
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
  oversoldCount,
}: ActionCenterProps) {
  const alerts = useActionCenterAlerts(
    expiringCount,
    lowStockCount,
    missingExpiryCount,
    oversoldCount,
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
        className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 pb-2"
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
