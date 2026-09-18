"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BellRing } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  useActionCenterAlerts,
  type AlertItem,
} from "@/lib/hooks/use-action-center-alerts";

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

  const bgStyles = {
    critical: "bg-destructive/10 border-destructive/20 text-destructive",
    warning: "bg-orange-500/10 border-orange-500/20 text-orange-600",
    info: "bg-blue-500/10 border-blue-500/20 text-blue-600",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
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
      className={`w-full h-[80px] border cursor-pointer hover:shadow-md transition-shadow duration-200 group relative overflow-hidden flex flex-col justify-center ${bgStyles[alert.priority]}`}
    >
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent dark:from-black/20 pointer-events-none" />

      <div className="px-3 py-2 sm:px-4 sm:py-2.5 relative z-10 flex flex-col h-full justify-center">
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
