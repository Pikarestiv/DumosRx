"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth, type RecentUser } from "@/lib/context/auth-context";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { OnlineOrdersModal } from "@/components/pos/online-orders-modal";
import { BroadcastBanner } from "./broadcast-banner";
import { ImpersonationBanner } from "./impersonation-banner";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { DashboardTour } from "./dashboard-tour";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useAutoLockStore,
  useAutoLockTimer,
  useLockOnFreshLoad,
  useLockShortcut,
} from "@/lib/hooks/use-auto-lock";
import { useSwipeNavigation } from "@/lib/hooks/use-swipe-navigation";
import { useSidebarPeekPreference } from "@/lib/hooks/use-sidebar-peek-preference";
import { useIsTouchDevice } from "@/lib/hooks/use-is-touch-device";
import { usePullToRefresh } from "@/lib/hooks/use-pull-to-refresh";
import {
  PullToRefreshProvider,
  usePullToRefreshDispatcher,
} from "@/lib/context/pull-to-refresh-context";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh-indicator";
import { sync } from "@/lib/db/sync-engine";
import { queryClient } from "@/lib/query-client";
import { LockScreen } from "@/components/auth/lock-screen";
import { AuthCardShell } from "@/components/auth/auth-card-shell";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const COLLAPSED_KEY = "sidebar_collapsed";

const DIRECTION_ANIMATION: Record<string, string> = {
  left: "slide-in-from-right-8",
  right: "slide-in-from-left-8",
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <PullToRefreshProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </PullToRefreshProvider>
  );
}

function DashboardLayoutInner({ children }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Selectors, not a destructured whole-store call. See the comment in
  // useAutoLockTimer for why (this component wraps the entire app).
  const isLocked = useAutoLockStore((s) => s.isLocked);
  const forceAccountSelection = useAutoLockStore(
    (s) => s.forceAccountSelection,
  );
  const unlock = useAutoLockStore((s) => s.unlock);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);

  useAutoLockTimer();
  useLockOnFreshLoad();
  useLockShortcut();

  useEffect(() => {
    try {
      const stored = localStorage.getItem("dumos_recent_users");
      if (stored) setRecentUsers(JSON.parse(stored));
    } catch {}
  }, []);

  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  // Order matches the bottom nav's visual left-to-right layout, so swiping
  // steps through tabs in the order they're actually shown on screen.
  const TABS = ["/dashboard", "/inventory", "/pos", "/customers"];
  const { handleTouchStart, handleTouchEnd, direction } = useSwipeNavigation(
    TABS,
    { onSwipePastEnd: () => setMoreDrawerOpen(true) },
  );

  const isPosRoute = pathname.startsWith("/pos");
  // Create Purchase Order gets a POS-style full-screen takeover, but only on
  // mobile (<lg). Desktop keeps the normal dashboard chrome since the page
  // already renders as a self-contained bordered panel there.
  const isCreatePORoute = pathname.startsWith("/procurement/new");
  // Settings is a full-screen takeover on every breakpoint (like POS/create-PO):
  // no app sidebar, no bottom nav, no dashboard header — settings-client.tsx
  // renders its own back-button header instead.
  const isSettingsRoute = pathname.startsWith("/settings");
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [userNavOpen, setUserNavOpen] = useState(false);
  const { peekEnabled } = useSidebarPeekPreference();
  // Touch devices (tablets/iPads at the lg: breakpoint where the desktop
  // sidebar shows) don't get real hover intent. A tap can synthesize a
  // hover-like event, which makes peek stick or flicker. Hard-disabled here
  // regardless of the peekEnabled preference, since it doesn't make sense on
  // touch at all: those devices only ever see plain collapsed or expanded.
  const isTouchDevice = useIsTouchDevice();
  const isLogicallyCollapsed = isPosRoute ? true : sidebarCollapsed;
  const effectiveCollapsed =
    isLogicallyCollapsed && !hoverExpanded && !userNavOpen;
  const contentCollapsed = isLogicallyCollapsed;

  /* Hydrate collapse preference from localStorage */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      // Only override the default if the user has an explicit stored preference
      if (stored === "false") setSidebarCollapsed(false);
      else if (stored === "true") setSidebarCollapsed(true);
      // If nothing stored, the useState(true) default applies
    } catch {
      // localStorage unavailable (e.g. SSR or private mode)
    }
  }, []);

  const handleToggleCollapse = () => {
    if (isPosRoute) {
      toast.info(
        "The POS view is collapsed by default to maximize workspace width.",
      );
      return;
    }
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  // POS and the mobile full-screen takeovers (create PO, settings inner
  // tabs) manage their own padding/back-header, so <main> stays unpadded for
  // them below their own "desktop" breakpoint; everywhere else gets the
  // standard page gutter. Each takeover's restore breakpoint must match the
  // breakpoint that page itself uses to switch to its desktop layout:
  // create-PO uses lg: (see procurement/new/page.tsx), settings inner tabs
  // use md: (see hooks/use-settings.ts's isDesktop, which flips at 768px).
  // Using the wrong one here left settings content unpadded between 768-1023px.
  const mainClassName =
    isPosRoute || isSettingsRoute
      ? ""
      : isCreatePORoute
        ? "p-0 lg:p-6 lg:pt-3"
        : "p-4 sm:p-6 sm:pt-3";
  // Bottom-nav clearance isn't needed for POS (no bottom nav there), the
  // create-PO takeover (its own fixed footer/drawer instead), or settings
  // (no bottom nav on that route either).
  const mainStyle =
    !isPosRoute && !isCreatePORoute && !isSettingsRoute
      ? {
          paddingBottom:
            "calc(5.5rem + var(--tauri-bottom, env(safe-area-inset-bottom, 0px)))",
        }
      : undefined;

  const shouldAnimate = !isPosRoute && !isCreatePORoute && !isSettingsRoute;

  const getRegisteredHandler = usePullToRefreshDispatcher();
  const { scrollRef, pullDistance, isRefreshing, threshold } =
    usePullToRefresh<HTMLDivElement>({
      disabled: !shouldAnimate,
      onRefresh: async () => {
        await sync(true);
        await queryClient.invalidateQueries();
        await getRegisteredHandler()?.();
      },
    });

  // Single lookup: avoids indexing DIRECTION_ANIMATION twice (once to check,
  // once to interpolate) and keeps the `direction === null` case contained
  // to this one spot instead of repeating `?? ""` at each usage site.
  const animationClass = shouldAnimate
    ? DIRECTION_ANIMATION[direction ?? ""]
    : undefined;

  return (
    <div className="min-h-screen bg-background relative">
      {isLocked && (
        <div
          // z-[9000], not higher than TauriTitleBar's z-[9999], otherwise
          // this full-viewport background paints over the title bar (and
          // its close/minimize/maximize controls) instead of just sitting
          // below it the way the paddingTop below already visually implies.
          className="fixed inset-0 z-[9000] bg-background flex flex-col items-center justify-center p-0 sm:p-4 overflow-y-auto"
          style={{
            paddingTop:
              "calc(var(--tauri-top, env(safe-area-inset-top, 0px)) + 1rem)",
            paddingBottom:
              "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)",
          }}
        >
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/60" />
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full h-[100dvh] sm:h-auto sm:max-w-md z-10 flex flex-col sm:justify-center"
          >
            <AuthCardShell variant="overlay">
              <div className="flex-1 flex flex-col pt-1 pb-0 px-4 sm:py-6 sm:px-6">
                <LockScreen
                  key={forceAccountSelection ? "select" : "default"}
                  recentUsers={recentUsers}
                  defaultUser={
                    !forceAccountSelection && user
                      ? { ...user, last_login: new Date().toISOString() }
                      : undefined
                  }
                  onLoginAsOther={() => {
                    unlock();
                    router.push("/login?mode=new");
                  }}
                  onUnlockSuccess={() => unlock()}
                />
              </div>
            </AuthCardShell>
          </motion.div>
        </div>
      )}

      {!isSettingsRoute && (
        <DashboardSidebar
          onOpenFeedback={() => setFeedbackOpen(true)}
          collapsed={effectiveCollapsed}
          logicalCollapsed={isLogicallyCollapsed}
          onToggleCollapse={handleToggleCollapse}
          onMouseEnter={() =>
            !isPosRoute && !isTouchDevice && peekEnabled && setHoverExpanded(true)
          }
          onMouseLeave={() => setHoverExpanded(false)}
          onUserNavOpenChange={setUserNavOpen}
        />
      )}

      {!isPosRoute && !isCreatePORoute && !isSettingsRoute && (
        <MobileBottomNav
          onOpenFeedback={() => setFeedbackOpen(true)}
          moreDrawerOpen={moreDrawerOpen}
          onMoreDrawerOpenChange={setMoreDrawerOpen}
        />
      )}

      <FeedbackForm open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <OnlineOrdersModal />

      {/* Main content: shifts right to clear the sidebar */}
      <div
        className={cn(
          "flex flex-col overflow-hidden transition-all duration-300",
          isSettingsRoute
            ? ""
            : contentCollapsed
              ? "lg:pl-[68px]"
              : "lg:pl-60",
        )}
        style={{
          height: "100dvh",
          // On POS/settings routes there's no header to carry the inset, so
          // keep it here. Elsewhere it moves onto the banner/header block
          // below so its own background (not this wrapper's, which can be a
          // different shade) paints all the way up under the status bar,
          // avoiding a seam.
          paddingTop:
            isPosRoute || isSettingsRoute
              ? "var(--tauri-top, 0px)"
              : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={cn(
            "shrink-0 bg-card sm:bg-background",
            isCreatePORoute && "hidden lg:block",
          )}
          style={{
            paddingTop:
              !isPosRoute && !isSettingsRoute
                ? "var(--tauri-top, 0px)"
                : undefined,
          }}
        >
          <ImpersonationBanner />
          <BroadcastBanner />
          {!isPosRoute && !isSettingsRoute && (
            <DashboardHeader onOpenFeedback={() => setFeedbackOpen(true)} />
          )}
        </div>

        {/* Page content: scrolls internally */}
        <div
          ref={scrollRef}
          className={cn(
            "flex-1 relative overflow-x-clip",
            shouldAnimate && "overflow-y-auto",
          )}
        >
          <PullToRefreshIndicator
            pullDistance={pullDistance}
            isRefreshing={isRefreshing}
            threshold={threshold}
          />
          <main
            className={cn("flex-1 min-h-0 flex flex-col", mainClassName)}
            style={mainStyle}
          >
            <div
              key={pathname}
              className={cn(
                "flex-1 min-h-0 flex flex-col",
                animationClass &&
                  `animate-in ${animationClass} fade-in duration-200`,
              )}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
      <DashboardTour />
    </div>
  );
}
