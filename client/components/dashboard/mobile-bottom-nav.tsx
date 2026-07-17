"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/context/store-context";
import { MobileMoreDrawer } from "./mobile-more-drawer";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  ShoppingCart,
  Users,
  Home,
  Pill,
  ShoppingBasket,
} from "lucide-react";

interface MobileBottomNavProps {
  onOpenFeedback: () => void;
}

export function MobileBottomNav({ onOpenFeedback }: MobileBottomNavProps) {
  const pathname = usePathname();
  const { storeType, t } = useStore();
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  const leftTabs = [
    { name: "Home", href: "/dashboard", icon: Home },
    {
      name: t("products"),
      href: "/inventory",
      icon: storeType === "pharmacy" ? Pill : ShoppingBasket,
    },
  ];

  const rightTabs = [
    { name: "Customers", href: "/customers", icon: Users },
  ];

  const allTabHrefs = [...leftTabs, ...rightTabs].map((t) => t.href).concat("/pos");
  const isMoreActive = pathname && !allTabHrefs.some((href) => pathname.startsWith(href));

  return (
    <>
      <div 
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
        style={{ paddingBottom: "var(--tauri-bottom, env(safe-area-inset-bottom))" }}
      >
        <nav className="flex items-center justify-between px-2 h-16 relative">
          {/* Left Tabs */}
          <div className="flex flex-1 justify-around h-full">
            {leftTabs.map((tab) => {
              const isActive = pathname.startsWith(tab.href);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={cn(
                    "relative flex flex-col items-center justify-center w-full h-full space-y-1 transition-all",
                    isActive 
                      ? "text-primary scale-105" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <span className="absolute top-1.5 w-1 h-1 rounded-full bg-primary" />
                  )}
                  <Icon 
                    className="h-5 w-5" 
                    strokeWidth={isActive ? 2 : 2} 
                    fill={isActive ? "currentColor" : "none"}
                  />
                  <span className="text-[10px] font-medium tracking-tight">
                    {tab.name}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Center POS Button */}
          <div className="relative w-16 h-full flex justify-center">
            <Link
              href="/pos"
              className={cn(
                "absolute -top-6 flex flex-col items-center justify-center w-[60px] h-[60px] rounded-full bg-primary text-primary-foreground shadow-[0_4px_15px_rgba(var(--primary),0.4)] border-[4px] border-background hover:scale-105 active:scale-95 transition-transform",
                pathname.startsWith("/pos") && "shadow-[0_0_20px_rgba(var(--primary),0.6)] ring-2 ring-primary/20 ring-offset-2 ring-offset-background"
              )}
            >
              <ShoppingCart 
                className="h-6 w-6" 
                strokeWidth={pathname.startsWith("/pos") ? 2.5 : 2} 
                fill={pathname.startsWith("/pos") ? "currentColor" : "none"}
              />
            </Link>
          </div>

          {/* Right Tabs */}
          <div className="flex flex-1 justify-around h-full">
            {rightTabs.map((tab) => {
              const isActive = pathname.startsWith(tab.href);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={cn(
                    "relative flex flex-col items-center justify-center w-full h-full space-y-1 transition-all",
                    isActive 
                      ? "text-primary scale-105" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <span className="absolute top-1.5 w-1 h-1 rounded-full bg-primary" />
                  )}
                  <Icon 
                    className="h-5 w-5" 
                    strokeWidth={isActive ? 2 : 2} 
                    fill={isActive ? "currentColor" : "none"}
                  />
                  <span className="text-[10px] font-medium tracking-tight">
                    {tab.name}
                  </span>
                </Link>
              );
            })}

            {/* More Button */}
            <button
              onClick={() => setMoreDrawerOpen(true)}
              className={cn(
                "relative flex flex-col items-center justify-center w-full h-full space-y-1 transition-all outline-none",
                isMoreActive 
                  ? "text-primary scale-105" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isMoreActive && (
                <span className="absolute top-1.5 w-1 h-1 rounded-full bg-primary" />
              )}
              <LayoutGrid 
                className="h-5 w-5" 
                strokeWidth={isMoreActive ? 2 : 2} 
                fill={isMoreActive ? "currentColor" : "none"}
              />
              <span className="text-[10px] font-medium tracking-tight">More</span>
            </button>
          </div>
        </nav>
      </div>

      <MobileMoreDrawer
        open={moreDrawerOpen}
        onOpenChange={setMoreDrawerOpen}
        onOpenFeedback={onOpenFeedback}
      />
    </>
  );
}
