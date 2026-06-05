"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/context/store-context";
import { MobileMoreDrawer } from "./mobile-more-drawer";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Menu,
  Pill,
  ShoppingBasket,
} from "lucide-react";

interface MobileBottomNavProps {
  onOpenFeedback: () => void;
}

export function MobileBottomNav({ onOpenFeedback }: MobileBottomNavProps) {
  const pathname = usePathname();
  const { storeType } = useStore();
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  const primaryTabs = [
    { name: "Home", href: "/dashboard", icon: LayoutDashboard },
    { name: "POS", href: "/pos", icon: ShoppingCart },
    {
      name: "Inventory",
      href: "/inventory",
      icon: storeType === "pharmacy" ? Pill : ShoppingBasket,
    },
    { name: "Customers", href: "/customers", icon: Users },
  ];

  const isMoreActive =
    pathname && !primaryTabs.some((tab) => pathname.startsWith(tab.href));

  return (
    <>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border pb-[env(safe-area-inset-bottom)]">
        <nav className="flex items-center justify-around px-2 h-16">
          {primaryTabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            const Icon = tab.icon;

            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full p-1",
                    isActive ? "bg-primary/10" : "",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-medium tracking-tight">
                  {tab.name}
                </span>
              </Link>
            );
          })}

          <button
            onClick={() => setMoreDrawerOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
              isMoreActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <div
              className={cn(
                "flex items-center justify-center rounded-full p-1",
                isMoreActive ? "bg-primary/10" : "",
              )}
            >
              <Menu className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-medium tracking-tight">More</span>
          </button>
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
