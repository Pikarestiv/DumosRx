"use client";

import type React from "react";

import { useState, useEffect, useMemo } from "react";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { isTillInspectionSession } from "@/lib/utils/till-inspection";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { OnlineOrdersModal } from "@/components/pos/online-orders-modal";
import { GatedAssistantPanel } from "@/components/assistant/gated-assistant-panel";
import { BroadcastBanner } from "./broadcast-banner";
import { ImpersonationBanner } from "./impersonation-banner";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { DashboardLockOverlay } from "./dashboard-lock-overlay";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useAutoLockStore,
  useAutoLockTimer,
  useLockOnFreshLoad,
  useLockShortcut,
  useSyncAutoLockDurationWithAccount,
} from "@/lib/hooks/use-auto-lock";
import { useSwipeNavigation } from "@/lib/hooks/use-swipe-navigation";
import { useSidebarPeekPreference } from "@/lib/hooks/use-sidebar-peek-preference";
import { usePosFullscreenStore } from "@/lib/hooks/use-pos-fullscreen";
import { useIsTouchDevice } from "@/lib/hooks/use-is-touch-device";
import { usePullToRefresh } from "@/lib/hooks/use-pull-to-refresh";
import {
  PullToRefreshProvider,
  usePullToRefreshDispatcher,
} from "@/lib/context/pull-to-refresh-context";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh-indicator";
import { sync } from "@/lib/db/sync-engine";
import { queryClient } from "@/lib/query-client";
import { usePostRestoreCloudLinkNotice } from "@/lib/hooks/use-post-restore-cloud-link-notice";
import { isTourEligible } from "@/lib/utils/tour-eligibility";
import { STORAGE_KEYS } from "@/lib/storage-keys";

const DashboardTour = dynamic(
  () => import("./dashboard-tour").then((m) => m.DashboardTour),
  { ssr: false },
);

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const COLLAPSED_KEY = STORAGE_KEYS.sidebarCollapsed;

function readStoredSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) !== "false";
  } catch {
    return true;
  }
}

const DIRECTION_ANIMATION: Record<string, string> = {
  left: "slide-in-from-right-8",
  right: "slide-in-from-left-8",
};

type MainLayoutKind = "pos" | "settings" | "createPO" | "default";

// Order matches the bottom nav's visual left-to-right layout, so swiping
// steps through tabs in the order they're actually shown on screen.
const TABS = ["/dashboard", "/inventory", "/pos", "/customers"];

// One entry per distinct <main> treatment, keyed by the same route partition used everywhere else in this file (isPosRoute…
// Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-dashboard-layout-tsx-L66
const MAIN_LAYOUT_STYLES: Record<
  MainLayoutKind,
  { className: string; style?: React.CSSProperties }
> = {
  // POS and the mobile full-screen takeovers (create PO, settings inner tabs) manage their own padding/back-header, so <main…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-dashboard-layout-tsx-L75
  pos: { className: "" },
  settings: { className: "" },
  createPO: { className: "p-0 lg:p-6 lg:pt-3" },
  default: {
    // Below lg: clears MobileBottomNav (h-16 = 4rem tall, plus its own safe-area inset, plus breathing room) on every route th…
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-dashboard-layout-tsx-L87
    className:
      "px-4 pt-4 sm:px-6 sm:pt-3 pb-[calc(5.5rem+var(--tauri-bottom,env(safe-area-inset-bottom,0px)))] lg:pb-[calc(1rem+var(--tauri-bottom,env(safe-area-inset-bottom,0px)))]",
  },
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <PullToRefreshProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </PullToRefreshProvider>
  );
}

function DashboardLayoutInner({ children }: DashboardLayoutProps) {
  const hydrated = useHydrated();
  const [sidebarCollapsedChoice, setSidebarCollapsedChoice] = useState<boolean | null>(null);
  const sidebarCollapsed =
    sidebarCollapsedChoice ?? (hydrated ? readStoredSidebarCollapsed() : true);
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Selectors, not a destructured whole-store call. See the comment in
  // useAutoLockTimer for why (this component wraps the entire app).
  const isLocked = useAutoLockStore((s) => s.isLocked);

  useAutoLockTimer();
  useLockOnFreshLoad();
  useLockShortcut();
  useSyncAutoLockDurationWithAccount(user?.id);

  // Known bug #10, Part B:
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-dashboard-layout-tsx-L126
  usePostRestoreCloudLinkNotice({
    onLinkCloud: () => router.push("/settings/cloud"),
  });

  const tourEligible = useMemo(() => hydrated && isTourEligible(), [hydrated]);

  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const { handleTouchStart, handleTouchEnd, direction } = useSwipeNavigation(
    TABS,
    { onSwipePastEnd: () => setMoreDrawerOpen(true) },
  );

  const isPosRoute = pathname.startsWith("/pos");
  const posFullscreen = usePosFullscreenStore((s) => s.isFullscreen);
  const isPosFullscreen = isPosRoute && posFullscreen;
  // Create Purchase Order gets a POS-style full-screen takeover, but only on mobile (<lg).
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-dashboard-layout-tsx-L150
  const isCreatePORoute = pathname.startsWith("/procurement/new");
  // Settings is a full-screen takeover on every breakpoint (like POS/create-PO):
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-dashboard-layout-tsx-L154
  const isSettingsRoute = pathname.startsWith("/settings");
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [userNavOpen, setUserNavOpen] = useState(false);
  const { peekEnabled } = useSidebarPeekPreference();
  // Touch devices (tablets/iPads at the lg:
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-dashboard-layout-tsx-L161
  const isTouchDevice = useIsTouchDevice();
  const isLogicallyCollapsed = isPosRoute ? true : sidebarCollapsed;
  const effectiveCollapsed =
    isLogicallyCollapsed && !hoverExpanded && !userNavOpen;
  const contentCollapsed = isLogicallyCollapsed;

  const handleToggleCollapse = () => {
    if (isPosRoute) {
      toast.info(
        "The POS view is collapsed by default to maximize workspace width.",
      );
      return;
    }
    const next = !sidebarCollapsed;
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {}
    setSidebarCollapsedChoice(next);
  };

  useEffect(() => {
    // An inspection session belongs at /inspect, which carries the banner, the End Session button and the idle timer.
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-dashboard-layout-tsx-L202
    if (isTillInspectionSession()) {
      router.replace("/inspect");
      return;
    }

    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  let mainLayoutKind: MainLayoutKind = "default";
  if (isPosRoute) mainLayoutKind = "pos";
  else if (isSettingsRoute) mainLayoutKind = "settings";
  else if (isCreatePORoute) mainLayoutKind = "createPO";
  const { className: mainClassName, style: mainStyle } =
    MAIN_LAYOUT_STYLES[mainLayoutKind];

  const shouldAnimate = mainLayoutKind === "default";

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

  // Single lookup: avoids indexing DIRECTION_ANIMATION twice (once to check, once to interpolate) and keeps the `direction =…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-dashboard-layout-tsx-L237
  const animationClass = shouldAnimate
    ? DIRECTION_ANIMATION[direction ?? ""]
    : undefined;

  return (
    // h-dvh, not min-h-screen:
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-dashboard-layout-tsx-L245
    <div className="h-dvh bg-background relative">
      {/* First focusable element in the shell: lets keyboard/screen-reader
          users jump the persistent sidebar and header nav (WCAG 2.4.1). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[9500] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to content
      </a>
      <DashboardLockOverlay />

      {!isSettingsRoute && !isPosFullscreen && (
        <DashboardSidebar
          onOpenFeedback={() => setFeedbackOpen(true)}
          collapsed={effectiveCollapsed}
          logicalCollapsed={isLogicallyCollapsed}
          onToggleCollapse={handleToggleCollapse}
          onMouseEnter={() =>
            !isPosRoute &&
            !isTouchDevice &&
            peekEnabled &&
            setHoverExpanded(true)
          }
          onMouseLeave={() => setHoverExpanded(false)}
          onUserNavOpenChange={setUserNavOpen}
        />
      )}

      {mainLayoutKind === "default" && (
        <MobileBottomNav
          onOpenFeedback={() => setFeedbackOpen(true)}
          moreDrawerOpen={moreDrawerOpen}
          onMoreDrawerOpenChange={setMoreDrawerOpen}
        />
      )}

      <FeedbackForm open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <OnlineOrdersModal />
      <GatedAssistantPanel />

      {/* Main content: shifts right to clear the sidebar */}
      <div
        className={cn(
          "flex flex-col overflow-hidden transition-all duration-300",
          isSettingsRoute || isPosFullscreen
            ? ""
            : contentCollapsed
              ? "lg:pl-[68px]"
              : "lg:pl-48",
        )}
        style={{
          height: "100dvh",
          // On POS/settings routes there's no header to carry the inset, so keep it here.
          // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-dashboard-layout-tsx-L304
          paddingTop:
            isPosRoute || isSettingsRoute ? "var(--tauri-top, 0px)" : undefined,
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

        {/* Page content: scrolls internally. — docs/CLIENT_COMMENTS.md#block-components-dashboard-dashboard-layout-tsx-L334 */}
        <div
          ref={scrollRef}
          className={cn(
            "flex-1 relative overflow-x-clip flex flex-col",
            shouldAnimate && "overflow-y-auto",
          )}
        >
          <PullToRefreshIndicator
            pullDistance={pullDistance}
            isRefreshing={isRefreshing}
            threshold={threshold}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className={cn("flex-1 min-h-0 flex flex-col outline-none", mainClassName)}
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
              {/* Unmounted, not just visually covered, while locked: the
                  lock overlay above is a fixed inset-0 layer, but leaving
                  `children` mounted underneath kept the previous user's data
                  on screen in the DOM and left every page-level polling/
                  refetch hook in the current route still running while the
                  device was supposedly locked (see docs/KNOWN_BUGS.md).
                  Unmounting drops both; remounting on unlock is cheap and
                  expected here, the same way switching routes already
                  remounts this same subtree via the `key={pathname}` above. */}
              {!isLocked && children}
            </div>
          </main>
        </div>
      </div>
      {tourEligible && <DashboardTour />}
    </div>
  );
}
