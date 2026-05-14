"use client";

import type React from "react";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThemeCustomizer } from "@/components/ui/theme-customizer";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { SyncIndicator } from "./sync-indicator";
import { APP_NAME } from "@/lib/constants";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  FileText,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Pill,
  ShoppingBasket,
  Wallet,
  Truck,
  ClipboardList,
  TrendingUp,
} from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { theme } = useTheme();
  const { storeType, t, storeProfile } = useStore();
  const { user, logout, isAdmin, isPharmacist } = useAuth();

  const navigationItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { 
      name: `${t('products')} Database`, 
      href: "/medicines", 
      icon: storeType === 'pharmacy' ? Pill : ShoppingBasket 
    },
    { name: "Inventory", href: "/inventory", icon: Package },
    { name: "Point of Sale", href: "/pos", icon: ShoppingCart },
    ...(storeType === 'pharmacy' 
      ? [{ name: "Prescriptions", href: "/prescriptions", icon: FileText }] 
      : []),
    { name: "Customers", href: "/customers", icon: Users },
    ...((isAdmin || isPharmacist) ? [
      { name: "Procurement", href: "/procurement", icon: ClipboardList },
      { name: "Expenses", href: "/expenses", icon: Wallet },
      { name: "Vendors", href: "/vendors", icon: Truck },
      { name: "Reports", href: "/reports", icon: BarChart3 },
    ] : []),
    ...(isAdmin ? [{ name: "Analytics", href: "/analytics", icon: TrendingUp }] : []),
    ...(isAdmin ? [{ name: "Settings", href: "/settings", icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ top: "var(--tauri-top, 0px)", height: "calc(100vh - var(--tauri-top, 0px))" }}
      >
        <div className="flex items-center gap-3 h-16 px-6 border-b border-sidebar-border">
          <img 
            src="/logo.png" 
            alt="DumosRx Logo" 
            className="h-8 w-auto object-contain transition-all duration-500" 
            style={{ filter: 'var(--logo-filter)' }}          />
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
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
                onClick={() => setSidebarOpen(false)}
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
        </nav>

        <SyncIndicator />

        <div className="p-4 border-t border-sidebar-border">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
            onClick={logout}
          >
            <LogOut className="h-4 w-4 mr-3" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
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
