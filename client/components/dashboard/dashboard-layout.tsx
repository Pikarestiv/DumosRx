"use client";

import type React from "react";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThemeCustomizer } from "@/components/ui/theme-customizer";
import { UserNav } from "@/components/dashboard/user-nav";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { APP_NAME } from "@/lib/constants";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { OnlineOrdersModal } from "@/components/pos/online-orders-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Store as StoreIcon, Lock, Search, Plus } from "lucide-react";
import { BroadcastBanner } from "./broadcast-banner";
import { DashboardSidebar } from "./dashboard-sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { LiveClock } from "./live-clock";
import { SyncIndicator } from "./sync-indicator";
import { DashboardTour } from "./dashboard-tour";
import { cn } from "@/lib/utils";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { LockScreen } from "@/components/auth/lock-screen";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const COLLAPSED_KEY = "sidebar_collapsed";

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { storeProfile, availableStores, switchStore, activeStoreId } =
    useStore();
  const { user } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(
    null,
  );

  const { duration, isLocked, lock, updateActivity, unlock } =
    useAutoLockStore();
  const [recentUsers, setRecentUsers] = useState<any[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("dumos_recent_users");
      if (stored) setRecentUsers(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    if (duration <= 0) return; // auto lock is off

    const handleActivity = () => updateActivity();

    // Attach listeners
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity);
    window.addEventListener("scroll", handleActivity);

    const interval = setInterval(() => {
      const {
        lastActivity,
        isLocked: currentLocked,
        duration: currentDuration,
      } = useAutoLockStore.getState();
      if (!currentLocked && currentDuration > 0) {
        const inactiveTime = Date.now() - lastActivity;
        if (inactiveTime > currentDuration * 60 * 1000) {
          lock();
        }
      }
    }, 10000); // Check every 10 seconds

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      clearInterval(interval);
    };
  }, [duration, updateActivity, lock]);

  const tabs = ["/dashboard", "/pos", "/inventory", "/customers"];
  const currentIndex = tabs.findIndex((t) => pathname.startsWith(t));
  const prevIndexRef = useRef(currentIndex);

  useEffect(() => {
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Ignore if touch is inside a horizontal scroll container
    let el = e.target as HTMLElement | null;
    while (el && el !== e.currentTarget) {
      const style = window.getComputedStyle(el);
      if (
        (style.overflowX === "auto" || style.overflowX === "scroll") &&
        el.scrollWidth > el.clientWidth
      ) {
        return;
      }
      el = el.parentElement;
    }
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - touchStart.x;
    const diffY = endY - touchStart.y;

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (currentIndex !== -1) {
        if (diffX > 0 && currentIndex > 0) {
          router.push(tabs[currentIndex - 1]);
        } else if (diffX < 0 && currentIndex < tabs.length - 1) {
          router.push(tabs[currentIndex + 1]);
        }
      }
    }
    setTouchStart(null);
  };

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

  return (
    <div className="min-h-screen bg-background relative">
      {isLocked && (
        <div 
          className="fixed inset-0 z-[99999] bg-background flex flex-col items-center justify-center p-0 sm:p-4 overflow-hidden"
          style={{ 
            paddingTop: "calc(var(--tauri-top, env(safe-area-inset-top, 0px)) + 1rem)",
            paddingBottom: "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)"
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
            <div className="flex-1 sm:flex-initial flex flex-col rounded-none sm:rounded-xl border-none sm:border-solid border-border shadow-none sm:shadow-2xl bg-transparent sm:bg-card/60 sm:backdrop-blur-2xl text-card-foreground">
              <div className="space-y-1 flex flex-col items-center text-center pb-2 p-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 260,
                    damping: 20,
                    delay: 0.2,
                  }}
                  className="mb-6 overflow-hidden"
                >
                  <Image
                    src="/logo.png"
                    alt="Logo"
                    width={180}
                    height={70}
                    className="object-contain"
                    style={{ filter: "var(--logo-filter)", height: "auto" }}
                  />
                </motion.div>
              </div>

              <div className="flex-1 flex flex-col pt-1 pb-0 px-4 sm:pb-6 sm:px-6">
                <LockScreen
                  recentUsers={recentUsers}
                  defaultUser={
                    user
                      ? { ...user, last_login: new Date().toISOString() }
                      : undefined
                  }
                  onLoginAsOther={() => {
                    unlock();
                    router.push("/login");
                  }}
                  onUnlockSuccess={() => unlock()}
                />
              </div>
            </div>

            <div className="mt-4 sm:mt-8 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">
              <Lock className="w-3 h-3" />
              Terminal Access • Secure Login
            </div>
          </motion.div>
        </div>
      )}

      <DashboardSidebar
        onOpenFeedback={() => setFeedbackOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <MobileBottomNav onOpenFeedback={() => setFeedbackOpen(true)} />

      <FeedbackForm open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <OnlineOrdersModal />

      {/* Main content — shifts right to clear the sidebar */}
      <div
        className={cn(
          "flex flex-col min-h-screen transition-all duration-300",
          sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-64",
        )}
        style={{
          paddingTop: "var(--tauri-top, 0px)",
          paddingBottom:
            "calc(5.5rem + var(--tauri-bottom, env(safe-area-inset-bottom)))",
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <BroadcastBanner />

        {/* Top header */}
        <header
          className="h-auto min-h-16 py-3 bg-background flex items-center justify-between px-4 sm:px-6 sticky z-40 before:absolute before:inset-x-0 before:bottom-full before:h-[100vh] before:bg-background before:-z-10"
          style={{ top: "var(--tauri-top, 0px)" }}
        >
          {/* Left side (Desktop & Mobile) */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm font-medium">
                {(() => {
                  const hour = new Date().getHours();
                  if (hour < 12) return "Good morning";
                  if (hour < 18) return "Good afternoon";
                  return "Good evening";
                })()}
              </span>
              <span className="text-foreground text-sm font-bold sm:hidden">
                {user?.first_name} {user?.last_name}
              </span>
              <span className="text-foreground text-sm font-bold hidden sm:inline-block">
                {user?.first_name}
              </span>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden sm:inline-block">
                {new Date().toLocaleDateString("en-US", { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
              <span className="hidden sm:inline-block text-border">•</span>
              <div className="flex items-center gap-1 font-medium text-foreground">
                <StoreIcon className="h-3 w-3" />
                <span className="truncate max-w-[120px] sm:max-w-[200px]">
                  {storeProfile?.name || APP_NAME}
                </span>
              </div>
            </div>

            {/* Mobile Sync Indicator */}
            <div className="sm:hidden mt-1">
              <SyncIndicator collapsed={false} isMobileHeader={true} />
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Desktop only features */}
            <div className="hidden sm:flex items-center gap-3">
              {/* Search Bar Placeholder */}
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                </div>
                <input
                  type="text"
                  placeholder="Search products, customers..."
                  className="pl-9 pr-4 py-2 bg-muted/50 border border-border/50 hover:border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-full text-sm outline-none transition-all w-64"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-[10px] font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 bg-background">⌘K</span>
                </div>
              </div>

              <button
                onClick={() => router.push("/pos")}
                className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                New Sale
              </button>
            </div>

            {/* Notification Bell */}
            <div className="relative border border-border/50 rounded-full p-0.5">
              <NotificationBell />
            </div>
            
            {/* Mobile User Nav */}
            <div className="sm:hidden">
              <UserNav />
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 relative overflow-x-clip">
          <main className="p-4 sm:p-6">{children}</main>
        </div>
      </div>
      <DashboardTour />
    </div>
  );
}
