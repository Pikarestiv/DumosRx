"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFeedback: () => void;
}

export function DashboardSidebar({ isOpen, onClose, onOpenFeedback }: DashboardSidebarProps) {
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

  return (
    <>
      {/* Mobile sidebar overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{
          top: "var(--tauri-top, 0px)",
          height: "calc(100vh - var(--tauri-top, 0px))",
        }}
      >
        <div className="flex items-center gap-3 h-16 px-6 border-b border-sidebar-border">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-8 w-auto object-contain transition-all duration-500"
            style={{ filter: "var(--logo-filter)" }}
          />
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navigationItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 cursor-default"
                    : "text-sidebar-foreground hover:bg-primary/50 hover:text-primary-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}

          {(isAdmin || isPharmacist) && (
            <Link
              href="/settings"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                pathname.startsWith("/settings")
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 cursor-default"
                  : "text-sidebar-foreground hover:bg-primary/50 hover:text-primary-foreground",
              )}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          )}

          <button
            onClick={onOpenFeedback}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-sidebar-foreground hover:bg-primary/50 hover:text-primary-foreground cursor-pointer"
          >
            <MessageSquare className="h-4 w-4" />
            Help & Feedback
          </button>

          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-sidebar-foreground hover:bg-primary/50 hover:text-primary-foreground cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </nav>

        <div className="border-t border-sidebar-border bg-sidebar">
          <SyncIndicator />
        </div>
      </div>
    </>
  );
}
