"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { SyncIndicator } from "./sync-indicator";
import { UserNav } from "@/components/dashboard/user-nav";
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Users,
  BarChart3,
  Settings,
  Pill,
  ShoppingBasket,
  Wallet,
  ClipboardList,
  ChevronsLeft,
  ChevronsRight,
  Lock,
} from "lucide-react";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useStockBatchStats } from "@/lib/hooks/use-stock-batch-stats";

interface DashboardSidebarProps {
  onOpenFeedback: () => void;
  collapsed: boolean;
  logicalCollapsed: boolean;
  onToggleCollapse: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onUserNavOpenChange?: (open: boolean) => void;
}

export function DashboardSidebar({
  onOpenFeedback,
  collapsed,
  logicalCollapsed,
  onToggleCollapse,
  onMouseEnter,
  onMouseLeave,
  onUserNavOpenChange,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const { storeType } = useStore();
  const { isAdmin, canManageStockBatch } = useAuth();
  const { currentTier } = useFeatureGate();

  const stockStats = useStockBatchStats();
  const actionableItemsCount =
    stockStats.lowStockCount +
    stockStats.expiredCount +
    stockStats.expiringSoonCount;

  const isLocked = (href: string) => {
    if (currentTier !== "free") return false;
    return ["/prescriptions", "/procurement", "/expenses"].includes(href);
  };

  const navigationItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    {
      name: "Inventory",
      href: "/inventory",
      icon: storeType === "pharmacy" ? Pill : ShoppingBasket,
    },
    { name: "Point of Sale", href: "/pos", icon: ShoppingCart },
    ...(storeType === "pharmacy"
      ? [{ name: "Prescriptions", href: "/prescriptions", icon: FileText }]
      : []),
    { name: "Customers", href: "/customers", icon: Users },
    ...(isAdmin || canManageStockBatch
      ? [
          {
            name: "Procurement",
            href: "/procurement",
            icon: ClipboardList,
          },
          { name: "Expenses", href: "/expenses", icon: Wallet },
          { name: "Reports", href: "/reports", icon: BarChart3 },
        ]
      : [
          {
            name: "Daily Close",
            href: "/reports?tab=daily_close",
            icon: BarChart3,
          },
        ]),
  ];

  const allItems = navigationItems;

  /** Shared nav link renderer — collapses to icon + tooltip when sidebar is narrow */
  const NavItem = ({
    href,
    icon: Icon,
    name,
  }: {
    href: string;
    icon: React.ElementType;
    name: string;
  }) => {
    const isActive = pathname.startsWith(href.split("?")[0]);
    const locked = isLocked(href);
    const link = (
      <Link
        href={href}
        id={`tour-nav${href.replace(/\//g, "-")}`}
        className={cn(
          "flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
          collapsed ? "justify-center px-2" : "",
          isActive
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 cursor-default"
            : locked
              ? "text-sidebar-foreground/40 hover:text-sidebar-foreground/60 cursor-not-allowed"
              : "text-sidebar-foreground hover:bg-primary/50 hover:text-primary-foreground",
        )}
      >
        <div className="flex items-center gap-3 truncate">
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && (
            <span className="truncate transition-all duration-200">{name}</span>
          )}
        </div>
        {!collapsed && (
          <div className="flex items-center gap-2">
            {name === "Inventory" && actionableItemsCount > 0 && (
              <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {actionableItemsCount > 99 ? "99+" : actionableItemsCount}
              </span>
            )}
            {locked && (
              <Lock className="h-3 w-3 text-sidebar-foreground/40 shrink-0" />
            )}
          </div>
        )}
      </Link>
    );

    const unTouredTooltips: Record<string, string> = {
      "/prescriptions": "Manage prescription queues and fulfillments",
      "/procurement": "Manage purchase orders and vendor relations",
      "/expenses": "Track store expenses and cash flow",
      "/reports": "View detailed analytics and performance reports",
    };

    const extraTooltip = !collapsed && unTouredTooltips[href];

    if (collapsed || extraTooltip) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent
            side="right"
            className={
              collapsed ? "font-medium text-xs" : "font-semibold text-xs ml-2"
            }
          >
            {collapsed ? (
              <>
                {name} {locked ? "🔒" : ""}
              </>
            ) : (
              extraTooltip
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return link;
  };

  return (
    <TooltipProvider>
      <>
        {/* Sidebar */}
        <div
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          className={cn(
            "hidden lg:flex fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex-col",
            collapsed ? "w-[68px]" : "w-60",
          )}
          style={{
            top: "var(--tauri-top, 0px)",
            height: "calc(100vh - var(--tauri-top, 0px))",
          }}
        >
          {/* Logo header */}
          <div
            className={cn(
              "flex items-center h-16 transition-all duration-300 overflow-hidden",
              collapsed ? "px-3 justify-center" : "px-5 gap-3",
            )}
          >
            {collapsed && (
              <Image
                src="/logo-icon.png"
                alt="Logo"
                width={32}
                height={32}
                className="object-contain shrink-0"
                style={{ filter: "var(--logo-filter)" }}
              />
            )}
            {!collapsed && (
              <img
                src="/logo.png"
                alt="Logo"
                className="h-8 w-auto object-contain transition-all duration-300"
                style={{ filter: "var(--logo-filter)" }}
              />
            )}
          </div>

          {/* Nav */}
          <nav
            className={cn(
              "flex-1 py-5 pt-3 space-y-1 overflow-y-auto overflow-x-hidden",
              collapsed ? "px-2" : "px-3",
            )}
          >
            {allItems.map((item) => (
              <NavItem
                key={item.name}
                href={item.href}
                icon={item.icon}
                name={item.name}
              />
            ))}

            {(isAdmin || canManageStockBatch) && (
              <NavItem href="/settings" icon={Settings} name="Settings" />
            )}

            {/* Collapse toggle — only on desktop */}
            <div className="pt-2 hidden lg:block">
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <button
                    id="tour-nav-collapse"
                    onClick={onToggleCollapse}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground",
                      collapsed ? "justify-center px-2" : "",
                    )}
                  >
                  <CollapseButtonContent 
                    logicalCollapsed={logicalCollapsed} 
                    collapsed={collapsed} 
                  />
                </button>
                </TooltipTrigger>
                {logicalCollapsed && (
                  <TooltipContent side="right" className="font-medium text-xs">
                    Expand sidebar
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </nav>

          {/* Footer Area */}
          <div className="bg-sidebar flex flex-col pt-2 pb-2 px-2 gap-0.5">
            <SyncIndicator collapsed={collapsed} />
            <div className="px-1">
              <UserNav
                showDetails={!collapsed}
                onOpenFeedback={onOpenFeedback}
                onOpenChange={onUserNavOpenChange}
              />
            </div>
          </div>
        </div>
      </>
    </TooltipProvider>
  );
}

function CollapseButtonContent({ logicalCollapsed, collapsed }: { logicalCollapsed: boolean, collapsed: boolean }) {
  if (!logicalCollapsed) {
    return (
      <>
        <ChevronsLeft className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate text-xs">Collapse sidebar</span>
      </>
    );
  }

  if (collapsed) {
    return <ChevronsRight className="h-[18px] w-[18px] shrink-0" />;
  }

  return (
    <>
      <ChevronsRight className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate text-xs">Pin sidebar open</span>
    </>
  );
}
