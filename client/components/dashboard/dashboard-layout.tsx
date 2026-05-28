"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThemeCustomizer } from "@/components/ui/theme-customizer";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { APP_NAME } from "@/lib/constants";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { BroadcastBanner } from "./broadcast-banner";
import { DashboardSidebar } from "./dashboard-sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const COLLAPSED_KEY = "sidebar_collapsed";

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const router = useRouter();
  const { storeProfile } = useStore();
  const { user } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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
    <div className="min-h-screen bg-background">
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
          "flex flex-col min-h-screen transition-all duration-300 pb-16 lg:pb-0",
          sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-64",
        )}
        style={{ paddingTop: "var(--tauri-top, 0px)" }}
      >
        <BroadcastBanner />

        {/* Top header */}
        <header
          className="h-16 bg-background border-b border-border flex items-center justify-between px-6 sticky z-40"
          style={{ top: "var(--tauri-top, 0px)" }}
        >
          <div className="flex items-center gap-4">
            <h1 className="font-serif font-black text-xl text-foreground truncate">
              {storeProfile?.name || APP_NAME}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ThemeCustomizer />
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
