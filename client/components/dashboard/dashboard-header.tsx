"use client";

import { usePathname, useRouter } from "next/navigation";
import { Plus, Store as StoreIcon } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { APP_NAME } from "@/lib/constants";
import { SyncIndicator } from "./sync-indicator";
import { NotificationBell } from "./notification-bell";
import { UserNav } from "./user-nav";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface DashboardHeaderProps {
  onOpenFeedback?: () => void;
}

const PAGE_ROUTES = [
  { path: "/inventory/products", title: "Product Catalog", desc: "Manage your pharmacy's core product database and pricing.", action: { label: "Add Product", path: "/inventory/products?action=add" } },
  { path: "/inventory/batches", title: "Stock Batches", desc: "Manage inventory intake, expiration dates, and physical stock.", action: { label: "Add Batch", path: "/inventory/batches?action=add" } },
  { path: "/inventory", title: "Inventory Dashboard", desc: "Overview of your inventory health and metrics." },
  { path: "/customers", title: "Customer Management", desc: "View and manage customer profiles, credit, and history.", action: { label: "Add Customer", path: "/customers?action=add" } },
  { path: "/sales", title: "Sales History", desc: "View and manage past transactions and returns." },
  { path: "/prescriptions", title: "Prescription Management", desc: "Track and fulfill patient prescriptions securely.", action: { label: "Create Prescription", path: "/prescriptions?action=add" } },
  { path: "/procurement", title: "Procurement & Orders", desc: "Manage suppliers, create purchase orders, and track deliveries.", action: { label: "Create Order", path: "/procurement?action=add" } },
  { path: "/expenses", title: "Expenses", desc: "Track and manage your pharmacy's operational expenses.", action: { label: "Add Expense", path: "/expenses?action=add" } },
  { path: "/reports", title: "Reporting Center", desc: "View performance metrics and generate detailed reports." },
  { path: "/settings", title: "Settings", desc: "Manage your pharmacy configuration and preferences." }
];

function getPageInfo(pathname: string) {
  if (pathname === "/" || pathname === "/dashboard") return null; // Use greeting
  
  const match = PAGE_ROUTES.find(route => pathname.startsWith(route.path));
  return match || { title: APP_NAME, desc: "", action: null };
}

export function DashboardHeader({ onOpenFeedback }: DashboardHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { storeProfile } = useStore();

  const pageInfo = getPageInfo(pathname || "/");

  return (
    <header
      className="h-auto min-h-16 py-3 bg-card sm:bg-background border-b border-border sm:border-transparent flex flex-col justify-center px-4 sm:px-6 sticky z-40 before:absolute before:inset-x-0 before:bottom-full before:h-[100vh] before:bg-card sm:before:bg-background before:-z-10"
      style={{ top: "var(--tauri-top, 0px)" }}
    >
      <div className="flex items-center justify-between w-full">
        {/* Left side (Desktop & Mobile) */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            {!pageInfo ? (
              <>
                <span className="text-foreground text-base sm:text-lg font-bold tracking-tight">
                  {(() => {
                    const hour = new Date().getHours();
                    if (hour < 12) return "Good morning,";
                    if (hour === 12) return "Good noon,";
                    if (hour < 17) return "Good afternoon,";
                    if (hour < 21) return "Good evening,";
                    return "Good night,";
                  })()}
                </span>
                <span className="text-foreground text-base sm:text-lg font-bold sm:hidden tracking-tight">
                  {user?.first_name} {user?.last_name}
                </span>
                <span className="text-foreground text-base sm:text-lg font-bold hidden sm:inline-block tracking-tight">
                  {user?.first_name}
                </span>
              </>
            ) : (
              <div className="flex items-center gap-2">
                {pageInfo.desc ? (
                  <TooltipProvider delayDuration={1000}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-foreground text-base sm:text-lg font-bold tracking-tight cursor-default">
                          {pageInfo.title}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        align="start"
                        className="max-w-[300px] text-sm"
                      >
                        <p>{pageInfo.desc}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span className="text-foreground text-base sm:text-lg font-bold tracking-tight">
                    {pageInfo.title}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline-block">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </span>
            <span className="hidden sm:inline-block text-border">•</span>
            <div className="flex items-center gap-1 font-medium text-foreground">
              <StoreIcon className="h-3 w-3" />
              <span className="truncate max-w-[120px] sm:max-w-[200px]">
                {storeProfile?.name || APP_NAME}
              </span>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Desktop only features */}
          <div className="hidden sm:flex items-center gap-3">
            <Button
              onClick={() => router.push(pageInfo?.action ? pageInfo.action.path : "/pos")}
            >
              <Plus className="h-4 w-4" />
              {pageInfo?.action ? pageInfo.action.label : "New Sale"}
            </Button>
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

      {/* Mobile Bottom Row (Sync Indicator & Action Button) */}
      <div className="sm:hidden mt-3 flex items-center justify-between w-full">
        <SyncIndicator collapsed={false} isMobileHeader={true} />
        
        <Button
          size="sm"
          className="rounded-full h-8 px-4 text-xs font-semibold"
          onClick={() => router.push(pageInfo?.action ? pageInfo.action.path : "/pos")}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          New
        </Button>
      </div>
    </header>
  );
}
