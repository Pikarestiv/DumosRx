"use client";

import { usePathname, useRouter } from "next/navigation";
import { Plus, Store as StoreIcon } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { APP_NAME } from "@/lib/constants";
import { SyncIndicator } from "./sync-indicator";
import { NotificationBell } from "./notification-bell";
import { UserNav } from "./user-nav";
import { UserProfileBadge } from "./user-profile-badge";
import { LiveClock } from "./live-clock";
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
  {
    path: "/inventory/catalog",
    title: "Product Catalog",
    desc: "Manage your pharmacy's core product database and pricing.",
    action: { label: "Add Product", path: "/inventory/catalog?action=add" },
  },
  {
    path: "/inventory/batches",
    title: "Stock Batches",
    desc: "Manage inventory intake, expiration dates, and physical stock.",
    action: { label: "Add Batch", path: "/inventory/batches?action=add" },
  },
  {
    path: "/inventory",
    title: "Inventory Dashboard",
    desc: "Overview of your inventory health and metrics.",
  },
  {
    path: "/customers",
    title: "Customer Management",
    desc: "View and manage customer profiles, credit, and history.",
    action: { label: "Add Customer", path: "/customers?action=add" },
  },
  {
    path: "/sales",
    title: "Sales History",
    desc: "View and manage past transactions and returns.",
  },
  {
    path: "/prescriptions",
    title: "Prescription Management",
    desc: "Track and fulfill patient prescriptions securely.",
    action: { label: "Create Prescription", path: "/prescriptions?action=add" },
  },
  {
    path: "/procurement/vendors",
    title: "Vendors & Suppliers",
    desc: "Manage supplier directory and view debt.",
    action: { label: "Add Supplier", path: "/procurement/vendors?action=add" },
  },
  {
    path: "/procurement/requests",
    title: "Requested Products",
    desc: "View and manage products requested by staff or customers.",
    action: {
      label: "Request Product",
      path: "/procurement/requests?action=add",
    },
  },
  {
    path: "/procurement",
    title: "Procurement",
    desc: "Manage suppliers, create purchase orders, and track deliveries.",
    action: { label: "Create Order", path: "/procurement/new" },
  },
  {
    path: "/expenses",
    title: "Expenses",
    desc: "Track and manage your pharmacy's operational expenses.",
    action: { label: "Add Expense", path: "/expenses?action=add" },
  },
  {
    path: "/reports",
    title: "Reporting Center",
    desc: "View performance metrics and generate detailed reports.",
  },
  {
    path: "/settings",
    title: "Settings",
    desc: "Manage your pharmacy configuration and preferences.",
  },
];

function getPageInfo(pathname: string) {
  if (pathname === "/" || pathname === "/dashboard") return null; // Use greeting

  const match = PAGE_ROUTES.find((route) => pathname.startsWith(route.path));
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
      className="h-auto min-h-16 py-4 bg-card sm:bg-background border-b border-border sm:border-b-0 flex flex-col justify-center px-4 sm:px-6 shrink-0"
    >
      <div className="flex items-center justify-between w-full">
        {/* Left side (Desktop & Mobile) */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 font-medium text-foreground">
              <StoreIcon className="h-3 w-3" />
              <span className="truncate max-w-[120px] sm:max-w-[200px]">
                {storeProfile?.name || APP_NAME}
              </span>
            </div>
            <span className="hidden sm:inline-block text-border">•</span>
            <span className="hidden sm:inline-block">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </span>
            <LiveClock />
          </div>

          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
            {!!!pageInfo && (
              <>
                <span className="text-foreground text-base sm:text-xl font-bold tracking-tight font-serif">
                  {(() => {
                    const hour = new Date().getHours();
                    if (hour < 12) return "Good morning,";
                    if (hour === 12) return "Good noon,";
                    if (hour < 17) return "Good afternoon,";
                    return "Good evening,";
                  })()}
                </span>
                <span className="text-foreground text-base sm:text-xl font-bold hidden sm:inline-block tracking-tight font-serif truncate">
                  {user?.first_name} {user?.last_name}
                </span>
                <span className="text-foreground text-base sm:text-xl font-bold sm:hidden tracking-tight font-serif truncate">
                  {user?.first_name}
                </span>
              </>
            )}
            {!!pageInfo && (
              <div className="flex items-center gap-2">
                {!!pageInfo.desc && (
                  <TooltipProvider delayDuration={1000}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-foreground text-base sm:text-xl font-bold tracking-tight cursor-default font-serif">
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
                )}
                {!pageInfo.desc && (
                  <span className="text-foreground text-base sm:text-xl font-bold tracking-tight font-serif">
                    {pageInfo.title}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Desktop only features */}
          <div className="hidden sm:flex items-center gap-3">
            <Button
              onClick={() =>
                router.push(pageInfo?.action ? pageInfo.action.path : "/pos")
              }
            >
              <Plus className="h-4 w-4" />
              {!!pageInfo?.action && pageInfo.action.label}
              {!pageInfo?.action && "New Sale"}
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

      {/* Mobile Bottom Row */}
      <div className="sm:hidden mt-3 flex items-center justify-between w-full gap-2">
        {pathname?.startsWith("/settings") ? (
          <>
            <div className="flex-1 overflow-x-auto overflow-y-hidden no-scrollbar">
              <UserProfileBadge />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <SyncIndicator collapsed={true} isMobileHeader={true} />
            </div>
          </>
        ) : (
          <>
            <SyncIndicator collapsed={false} isMobileHeader={true} />

            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                className="rounded-full h-8 px-4 text-xs font-semibold"
                onClick={() =>
                  router.push(pageInfo?.action ? pageInfo.action.path : "/pos")
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                New
              </Button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
