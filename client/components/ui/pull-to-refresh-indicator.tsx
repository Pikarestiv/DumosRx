"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 64,
}: PullToRefreshIndicatorProps) {
  const progress = Math.min(pullDistance / threshold, 1);
  if (pullDistance <= 0 && !isRefreshing) return null;

  return (
    <div
      aria-hidden
      className="absolute top-0 left-0 right-0 flex items-start justify-center overflow-hidden pointer-events-none z-30"
      style={{ height: isRefreshing ? threshold : pullDistance }}
    >
      <div className="pt-3">
        <div className="bg-card/95 border border-border rounded-full p-2 shadow-md">
          <RefreshCw
            className={cn(
              "w-4 h-4 text-primary",
              isRefreshing && "animate-spin",
            )}
            style={
              !isRefreshing
                ? { transform: `rotate(${progress * 360}deg)`, opacity: progress }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
