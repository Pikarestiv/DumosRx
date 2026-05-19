"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThemeCustomizer } from "@/components/ui/theme-customizer";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { APP_NAME } from "@/lib/constants";
import { Menu } from "lucide-react";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { BroadcastBanner } from "./broadcast-banner";
import { DashboardSidebar } from "./dashboard-sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const { storeProfile } = useStore();
  const { user } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenFeedback={() => setFeedbackOpen(true)}
      />

      <FeedbackForm open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <BroadcastBanner />

        {/* Top header */}
        <header
          className="h-16 bg-background border-b border-border flex items-center justify-between px-6 sticky z-40"
          style={{ top: "var(--tauri-top, 0px)" }}
        >
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>

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
