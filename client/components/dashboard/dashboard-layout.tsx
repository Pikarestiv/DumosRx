"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/context/auth-context";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { OnlineOrdersModal } from "@/components/pos/online-orders-modal";
import { Lock } from "lucide-react";
import { BroadcastBanner } from "./broadcast-banner";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { DashboardTour } from "./dashboard-tour";
import { cn } from "@/lib/utils";
import { useAutoLockStore, useAutoLockTimer } from "@/lib/hooks/use-auto-lock";
import { useSwipeNavigation } from "@/lib/hooks/use-swipe-navigation";
import { LockScreen } from "@/components/auth/lock-screen";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const COLLAPSED_KEY = "sidebar_collapsed";

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const router = useRouter();
  const { user } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { isLocked, unlock } = useAutoLockStore();
  const [recentUsers, setRecentUsers] = useState<any[]>([]);

  useAutoLockTimer();

  useEffect(() => {
    try {
      const stored = localStorage.getItem("dumos_recent_users");
      if (stored) setRecentUsers(JSON.parse(stored));
    } catch {}
  }, []);

  const TABS = ["/dashboard", "/pos", "/inventory", "/customers"];
  const { handleTouchStart, handleTouchEnd } = useSwipeNavigation(TABS);

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
          sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-60",
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

        <DashboardHeader />

        {/* Page content */}
        <div className="flex-1 relative overflow-x-clip">
          <main className="p-4 sm:p-6">{children}</main>
        </div>
      </div>
      <DashboardTour />
    </div>
  );
}
