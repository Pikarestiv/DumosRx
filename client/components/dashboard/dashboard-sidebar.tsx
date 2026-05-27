"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { SyncIndicator } from "./sync-indicator";
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Users,
  BarChart3,
  Settings,
  LogOut,
  X,
  Pill,
  ShoppingBasket,
  Wallet,
  ClipboardList,
  MessageSquare,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFeedback: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function DashboardSidebar({
  isOpen,
  onClose,
  onOpenFeedback,
  collapsed,
  onToggleCollapse,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const { storeType, t } = useStore();
  const { logout, isAdmin, isPharmacist } = useAuth();

  const navigationItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    {
      name: `Inventory & ${t("products")}`,
      href: "/inventory",
      icon: storeType === "pharmacy" ? Pill : ShoppingBasket,
    },
    { name: "Point of Sale", href: "/pos", icon: ShoppingCart },
    ...(storeType === "pharmacy"
      ? [{ name: "Prescriptions", href: "/prescriptions", icon: FileText }]
      : []),
    { name: "Customers", href: "/customers", icon: Users },
    ...(isAdmin || isPharmacist
      ? [
          {
            name: "Procurement & Vendors",
            href: "/procurement",
            icon: ClipboardList,
          },
          { name: "Expenses", href: "/expenses", icon: Wallet },
          { name: "Reports & Analytics", href: "/reports", icon: BarChart3 },
        ]
      : []),
  ];

  const allItems = [
    ...navigationItems,
    ...(isAdmin || isPharmacist
      ? [{ name: "Settings", href: "/settings", icon: Settings }]
      : []),
  ];

  /** Shared nav link renderer — collapses to icon + tooltip when sidebar is narrow */
  const NavItem = ({
    href,
    icon: Icon,
    name,
    onClick,
  }: {
    href: string;
    icon: React.ElementType;
    name: string;
    onClick?: () => void;
  }) => {
    const isActive = pathname.startsWith(href);
    const link = (
      <Link
        href={href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
          collapsed ? "justify-center px-2" : "",
          isActive
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 cursor-default"
            : "text-sidebar-foreground hover:bg-primary/50 hover:text-primary-foreground",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && (
          <span className="truncate transition-all duration-200">{name}</span>
        )}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium text-xs">
            {name}
          </TooltipContent>
        </Tooltip>
      );
    }

    return link;
  };

  /** Shared button-style action item */
  const ActionItem = ({
    icon: Icon,
    name,
    onClick,
  }: {
    icon: React.ElementType;
    name: string;
    onClick: () => void;
  }) => {
    const btn = (
      <button
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer text-sidebar-foreground hover:bg-primary/50 hover:text-primary-foreground",
          collapsed ? "justify-center px-2" : "",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{name}</span>}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium text-xs">
            {name}
          </TooltipContent>
        </Tooltip>
      );
    }

    return btn;
  };

  return (
    <TooltipProvider>
      <>
        {/* Mobile overlay */}
        {isOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden transition-all duration-300"
            onClick={onClose}
          />
        )}

        {/* Sidebar */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-sidebar-border transform transition-all duration-300 ease-in-out lg:translate-x-0 flex flex-col",
            /* on mobile always 64 wide when open; on lg respect collapsed */
            "w-64 lg:w-64",
            collapsed ? "lg:w-[68px]" : "lg:w-64",
            isOpen ? "translate-x-0" : "-translate-x-full",
          )}
          style={{
            top: "var(--tauri-top, 0px)",
            height: "calc(100vh - var(--tauri-top, 0px))",
          }}
        >
          {/* Logo header */}
          <div
            className={cn(
              "flex items-center h-16 border-b border-sidebar-border transition-all duration-300 overflow-hidden",
              collapsed ? "px-3 justify-center" : "px-5 gap-3",
            )}
          >
            {collapsed ? (
              /* Icon-only logo */
              <Image
                src="/logo-icon.png"
                alt="Logo"
                width={32}
                height={32}
                className="object-contain shrink-0"
                style={{ filter: "var(--logo-filter)" }}
              />
            ) : (
              /* Full wordmark logo */
              <img
                src="/logo.png"
                alt="Logo"
                className="h-8 w-auto object-contain transition-all duration-300"
                style={{ filter: "var(--logo-filter)" }}
              />
            )}

            {/* Mobile close button — visible only on small screens */}
            {!collapsed && (
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden ml-auto"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Nav */}
          <nav
            className={cn(
              "flex-1 py-5 space-y-1 overflow-y-auto overflow-x-hidden",
              collapsed ? "px-2" : "px-3",
            )}
          >
            {allItems.map((item) => (
              <NavItem
                key={item.name}
                href={item.href}
                icon={item.icon}
                name={item.name}
                onClick={onClose}
              />
            ))}

            <div className="pt-2 border-t border-sidebar-border mt-2">
              <ActionItem
                icon={MessageSquare}
                name="Help & Feedback"
                onClick={() => {
                  onOpenFeedback();
                  onClose();
                }}
              />
              <ActionItem icon={LogOut} name="Sign Out" onClick={logout} />
            </div>

            {/* Collapse toggle — only on desktop */}
            <div className="pt-2 hidden lg:block">
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <button
                    onClick={onToggleCollapse}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground",
                      collapsed ? "justify-center px-2" : "",
                    )}
                  >
                    {collapsed ? (
                      <ChevronsRight className="h-[18px] w-[18px] shrink-0" />
                    ) : (
                      <>
                        <ChevronsLeft className="h-[18px] w-[18px] shrink-0" />
                        <span className="truncate text-xs">
                          Collapse sidebar
                        </span>
                      </>
                    )}
                  </button>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="font-medium text-xs">
                    Expand sidebar
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </nav>

          {/* Sync indicator */}
          <div className="border-t border-sidebar-border bg-sidebar">
            <SyncIndicator collapsed={collapsed} />
          </div>
        </div>
      </>
    </TooltipProvider>
  );
}
