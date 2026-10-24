"use client";

import { RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { AuthModal } from "./auth-modal";
import { cn } from "@/lib/utils";
import { formatDistanceSafe } from "@/lib/utils/date-utils";
import { useSyncIndicatorState } from "@/lib/hooks/use-sync-indicator-state";
import { getSyncStatusConfig } from "./sync-indicator-status-config";

export function SyncIndicator({ collapsed = false, isMobileHeader = false }: { collapsed?: boolean; isMobileHeader?: boolean }) {
  const {
    status,
    lastSync,
    isSyncInProgress,
    errorMessage,
    showAuthModal,
    setShowAuthModal,
    isLinked,
    isImpersonating,
    pendingCount,
    isSyncOverdue,
    handleManualSync,
  } = useSyncIndicatorState();

  // Backlog alone drives visibility; isSyncOverdue only escalates urgency.
  const needsSync = pendingCount > 0;

  const currentConfig = getSyncStatusConfig({
    collapsed,
    isImpersonating,
    isSyncInProgress,
    status,
    needsSync,
    isLinked,
    isSyncOverdue,
    errorMessage,
    pendingCount,
    lastSync,
  });
  const statusLabel = currentConfig.label;
  const statusIcon = currentConfig.icon;
  // Collapsed shows the bare icon; border and background fade in with the
  // sidebar's own expand transition.
  const statusBorder = collapsed ? "border-transparent" : currentConfig.border;
  const desktopBg = collapsed ? "hover:bg-sidebar-accent" : currentConfig.desktopBg;
  const mobileBg = currentConfig.mobileBg;
  const tooltipText = currentConfig.tooltip;

  if (isMobileHeader) {
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          title={isImpersonating ? tooltipText : undefined}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full border max-w-fit transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:w-3.5 [&_svg]:h-3.5",
            mobileBg, statusBorder,
            isImpersonating ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          )}
          onClick={() => void handleManualSync()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              void handleManualSync();
            }
          }}
        >
          {statusIcon}
          <span className="text-[12px] font-medium text-muted-foreground whitespace-nowrap">
            {statusLabel}
          </span>
        </div>
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </>
    );
  }

  // One persistent shape revealed by max-width/height transitions, never
  // two trees swapped by a conditional (client/AGENTS.md).
  return (
    <div className="px-2 pb-1">
      <div
        id="tour-sync-indicator"
        role="button"
        tabIndex={0}
        className={cn(
          "border rounded-xl transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isImpersonating ? "cursor-not-allowed opacity-70" : "cursor-pointer",
          collapsed ? "p-2" : "p-2.5",
          statusBorder,
          desktopBg,
        )}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void handleManualSync();
          }
        }}
        onClick={() => {
          // Never gate this on `status`: navigator.onLine misreports after
          // mobile wake, and sync() already handles being offline.
          void handleManualSync();
        }}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex flex-col transition-all duration-300",
                  collapsed ? "gap-0" : "gap-1.5",
                )}
              >
                <div
                  className={cn(
                    "flex items-center transition-all duration-300",
                    collapsed ? "justify-center" : "justify-between",
                  )}
                >
                  <div className="flex items-center min-w-0">
                    {statusIcon}
                    <span
                      className={cn(
                        "text-[11px] font-bold text-sidebar-foreground uppercase tracking-tight whitespace-nowrap overflow-hidden transition-all duration-300",
                        collapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[100px] opacity-100 ml-2",
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "overflow-hidden transition-all duration-300 shrink-0",
                          collapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[28px] opacity-100 ml-2",
                        )}
                      >
                        <button
                          type="button"
                          data-testid="sync-now-button"
                          onClick={(e) => {
                            // The card's own onClick would otherwise fire a
                            // second, mutex-colliding sync.
                            e.stopPropagation();
                            void handleManualSync();
                          }}
                          disabled={isImpersonating || isSyncInProgress}
                          aria-label="Sync now"
                          className="p-1 border border-sidebar-border rounded-md transition-colors disabled:opacity-30 cursor-pointer hover:bg-sidebar-accent relative z-10"
                        >
                          <RefreshCw
                            className={cn(
                              "h-3 w-3 text-sidebar-foreground !flex",
                              isSyncInProgress && "animate-spin",
                            )}
                          />
                        </button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="font-semibold text-xs mb-1 bg-card border-accent/10">
                      {isImpersonating ? "Sync disabled while impersonating" : "Sync Now"}
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div
                  className={cn(
                    "overflow-hidden transition-all duration-300 pl-5",
                    collapsed ? "max-h-0 opacity-0" : "max-h-5 opacity-100",
                  )}
                >
                  <p className="text-[10px] text-sidebar-foreground/70 font-medium whitespace-nowrap">
                    Last synced {!!(lastSync) && formatDistanceSafe(lastSync).replace('about ', '').replace('less than a minute', '1 min') + " ago"}
                    {!(lastSync) && "never"}
                  </p>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-card border-accent/10 max-w-[180px]">
              <div className="space-y-1">
                <p className="text-xs font-bold">Cloud Sync Engine</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{tooltipText}</p>
                {collapsed && lastSync && (
                  <p className="text-[10px] text-muted-foreground">
                    Last sync: {formatDistanceSafe(lastSync)} ago
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}
