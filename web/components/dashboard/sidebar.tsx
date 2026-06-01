"use client";

import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  Store,
  Users,
  CreditCard,
  Download,
  LogOut,
  Bell,
  Shield,
  Activity,
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

export function Sidebar({
  activeTab,
  setActiveTab,
  user,
  onLogout,
  mobileOpen,
  setMobileOpen,
}: SidebarProps) {
  const sidebarItems = [
    { id: "overview", name: "Overview", icon: LayoutDashboard },
    { id: "notifications", name: "Notifications", icon: Bell },
    { id: "fleet", name: "Store Fleet", icon: Store },
    { id: "staff", name: "Staff Management", icon: Users },
    { id: "activities", name: "Staff Activities", icon: Activity },
    { id: "billing", name: "Subscription", icon: CreditCard },
    { id: "downloads", name: "App Downloads", icon: Download },
    { id: "profile", name: "Account Security", icon: Shield },
  ];

  const renderSidebar = (isMobile: boolean) => (
    <>
      <div className="p-5 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="DumosRx Logo"
            width={100}
            height={36}
            className="h-10 w-auto object-contain"
            style={{ filter: "var(--logo-filter)" }}
            priority
          />
        </Link>
        {isMobile && setMobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {sidebarItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              if (isMobile && setMobileOpen) setMobileOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === item.id
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:bg-primary/5 hover:text-primary-foreground"
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t">
        <div className="bg-muted/50 rounded-2xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary animate-pulse">
            {user?.name?.charAt(0) || "U"}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-bold truncate">{user?.name || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="p-2 hover:bg-destructive/10 rounded-lg transition-colors group"
          >
            <LogOut className="h-4 w-4 text-muted-foreground group-hover:text-destructive transition-colors" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col bg-background border-r h-full">
        {renderSidebar(false)}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity" onClick={() => setMobileOpen && setMobileOpen(false)} />
          {/* Drawer content */}
          <aside className="relative flex w-72 max-w-xs flex-col bg-background border-r h-full shadow-2xl animate-in slide-in-from-left duration-300">
            {renderSidebar(true)}
          </aside>
        </div>
      )}
    </>
  );
}
