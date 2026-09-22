"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { useInventoryAudit } from "@/lib/context/inventory-audit-context";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { formatHeaderDate } from "@/lib/utils/date-utils";
import { getPageInfo, resolveHeaderAction, resolveSecondaryHeaderAction } from "@/lib/constants/dashboard-page-routes";
import { SyncIndicator } from "./sync-indicator";
import { NotificationBell } from "./notification-bell";
import { UserNav } from "./user-nav";
import { UserProfileBadge } from "./user-profile-badge";
import { LiveClock } from "./live-clock";
import { HeaderStoreSwitcher } from "./header-store-switcher";
import { HeaderPageHeading } from "./header-page-heading";
import { HeaderActionButton } from "./header-action-button";
import { Button } from "@/components/ui/button";

/** Start Audit's `path` is a signal route (see dashboard-page-routes.ts), not
 * a real page - it exists purely so useStockBatchManagement's effect can
 * catch the navigation and open the audit overlay instead. That round trip
 * requires a working client-side transition. On a static-export deployment
 * (output: "export", see next.config.mjs) navigating to a not-yet-visited
 * route can fall back to a full page reload, which wipes all React state
 * before the overlay ever gets to open - so this button sets the overlay
 * state directly instead of going through router.push at all. */
const START_AUDIT_PATH = "/inventory/audits";

interface DashboardHeaderProps {
  onOpenFeedback?: () => void;
}

export function DashboardHeader({ onOpenFeedback }: DashboardHeaderProps) {
  const pathname = usePathname() || "/";
  const { user, canManageStockBatch, isAdmin } = useAuth();
  const { storeProfile, availableStores, activeStoreId, switchStore } = useStore();
  const { setIsAuditing } = useInventoryAudit();
  const { canManageMultiStore } = useFeatureGate();
  // Plan entitlement AND this device actually having synced 2+ stores —
  // same combination stock-movements.tsx's canTransferStock uses. Only
  // actionRequiresMultiStore routes (Transfer Stock) read this.
  const hasMultiStoreAccess = canManageMultiStore && availableStores.length > 1;

  const pageInfo = getPageInfo(pathname);
  const action = resolveHeaderAction(pathname, pageInfo, canManageStockBatch, isAdmin, hasMultiStoreAccess);
  // Start Audit was gated on isAdmin (not canManageStockBatch, which also
  // covers the "specialist" role) before it moved into the shared header —
  // passing isAdmin here keeps that exact gate rather than widening it.
  const secondaryAction = resolveSecondaryHeaderAction(pathname, pageInfo, isAdmin);
  const isSettingsRoute = pathname.startsWith("/settings");

  return (
    <header className="h-auto min-h-16 py-4 bg-card sm:bg-background border-b border-border sm:border-b-0 flex flex-col justify-center px-4 sm:px-6 shrink-0">
      <div className="flex items-center justify-between w-full">
        {/* Left side (Desktop & Mobile) */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <HeaderStoreSwitcher
              storeProfile={storeProfile}
              availableStores={availableStores}
              activeStoreId={activeStoreId}
              onSwitchStore={switchStore}
              isAdmin={isAdmin}
            />
            <span className="hidden sm:inline-block text-border">•</span>
            <span className="hidden sm:inline-block">{formatHeaderDate()}</span>
            <LiveClock />
          </div>

          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
            <HeaderPageHeading pageInfo={pageInfo} firstName={user?.first_name} />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Desktop only features */}
          <div className="hidden sm:flex items-center gap-3">
            {isSettingsRoute ? (
              <UserProfileBadge />
            ) : (
              <>
                {secondaryAction && (
                  secondaryAction.path === START_AUDIT_PATH ? (
                    <Button variant="outline" onClick={() => setIsAuditing(true)}>
                      {secondaryAction.label}
                    </Button>
                  ) : (
                    <HeaderActionButton action={secondaryAction} variant="outline" />
                  )
                )}
                {action && <HeaderActionButton action={action} />}
              </>
            )}
          </div>

          {/* Notification Bell */}
          <div className="relative border border-border/50 rounded-full p-0.5">
            <NotificationBell />
          </div>

          {/* Mobile User Nav */}
          <div className="sm:hidden">
            <UserNav onOpenFeedback={onOpenFeedback} />
          </div>
        </div>
      </div>

      {/* Mobile Bottom Row */}
      <div className="sm:hidden mt-3 flex items-center justify-between w-full gap-2">
        {isSettingsRoute ? (
          <>
            <div className="flex-1 overflow-x-auto overflow-y-hidden no-scrollbar">
              <UserProfileBadge />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <SyncIndicator collapsed={true} isMobileHeader={true} />
            </div>
          </>
        ) : (
          <>
            <SyncIndicator collapsed={false} isMobileHeader={true} />

            {action && (
              <div className="flex items-center gap-2 shrink-0">
                <HeaderActionButton action={action} size="compact" />
              </div>
            )}
          </>
        )}
      </div>
    </header>
  );
}
