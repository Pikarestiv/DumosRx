"use client";

import type React from "react";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThemeCustomizer } from "@/components/ui/theme-customizer";
import { UserNav } from "@/components/dashboard/user-nav";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { APP_NAME } from "@/lib/constants";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Store as StoreIcon } from "lucide-react";
import { BroadcastBanner } from "./broadcast-banner";
import { DashboardSidebar } from "./dashboard-sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { LiveClock } from "./live-clock";
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
  const { storeProfile, availableStores, switchStore, activeStoreId } = useStore();
  const { user } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const { duration, isLocked, lock, updateActivity, unlock } = useAutoLockStore();
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
      const { lastActivity, isLocked: currentLocked, duration: currentDuration } = useAutoLockStore.getState();
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
  const currentIndex = tabs.findIndex(t => pathname.startsWith(t));
  const prevIndexRef = useRef(currentIndex);
  
  useEffect(() => {
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  const direction = currentIndex > prevIndexRef.current ? 1 : -1;

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

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 30 : -30, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -30 : 30, opacity: 0 }),
  };

  return (
    <div className="min-h-screen bg-background relative">
      {isLocked && (
        <div className="fixed inset-0 z-[99999] bg-background flex flex-col items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md bg-card p-6 sm:p-8 rounded-xl shadow-xl border border-border">
            <LockScreen 
              recentUsers={recentUsers} 
              onLoginAsOther={() => {
                unlock();
                router.push("/login");
              }}
              onUnlockSuccess={() => unlock()}
            />
          </div>
        </div>
      )}

      <DashboardSidebar
        onOpenFeedback={() => setFeedbackOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <MobileBottomNav onOpenFeedback={() => setFeedbackOpen(true)} />

      <FeedbackForm open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      {/* Main content — shifts right to clear the sidebar */}
      <div
        className={cn(
          "flex flex-col min-h-screen transition-all duration-300 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0",
          sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-64",
        )}
        style={{ paddingTop: "var(--tauri-top, 0px)" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <BroadcastBanner />

        {/* Top header */}
        <header
          className="h-16 bg-background border-b border-border flex items-center justify-between px-4 sm:px-6 sticky z-40"
          style={{ top: "var(--tauri-top, 0px)" }}
        >
          <div className="flex items-center gap-4">
            {(!user?.store_id && availableStores.length > 1) ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 outline-none hover:opacity-80 transition-opacity">
                  <h1 className="font-serif font-black text-xl text-foreground truncate max-w-[200px] sm:max-w-xs">
                    {storeProfile?.name || APP_NAME}
                  </h1>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[240px]">
                  {availableStores.map((store) => (
                    <DropdownMenuItem 
                      key={store.id} 
                      onClick={() => switchStore(store.id)}
                      className={cn(
                        "flex items-center gap-2 py-2 cursor-pointer",
                        store.id === activeStoreId && "bg-primary/10 text-primary font-medium focus:bg-primary/20"
                      )}
                    >
                      <StoreIcon className="h-4 w-4" />
                      <span className="truncate">{store.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <h1 className="font-serif font-black text-xl text-foreground truncate max-w-[200px] sm:max-w-xs">
                {storeProfile?.name || APP_NAME}
              </h1>
            )}
            <LiveClock />
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ThemeCustomizer />
            <UserNav />
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 relative overflow-x-clip">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={currentIndex !== -1 ? currentIndex : pathname}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="w-full h-full"
            >
              <main className="p-4 sm:p-6">{children}</main>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <DashboardTour />
    </div>
  );
}
