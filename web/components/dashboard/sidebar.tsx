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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
}

export function Sidebar({
  activeTab,
  setActiveTab,
  user,
  onLogout,
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

  const renderSidebar = (_isMobile: boolean) => (
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
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {sidebarItems.map((item) => {
          const tooltipContent: Record<string, string> = {
            notifications: "Stay updated with important system alerts",
            activities: "Track staff activities and inventory changes",
            billing: "Manage your subscription and billing details",
            downloads: "Download the mobile or desktop apps",
            profile: "Access your account security settings"
          };

          const button = (
            <button
              key={item.id}
              id={`tour-nav-${item.id}`}
              onClick={() => {
                setActiveTab(item.id);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === item.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </button>
          );

          if (!tooltipContent[item.id]) return button;

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                {button}
              </TooltipTrigger>
              <TooltipContent side="right" className="font-semibold text-xs ml-2">
                {tooltipContent[item.id]}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="p-4 border-t">
        <div id="tour-profile" className="bg-muted/50 rounded-2xl p-4 flex items-center gap-3">
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
      <aside className="hidden lg:flex w-72 flex-col bg-background border-r h-full">
        {renderSidebar(false)}
      </aside>
    </>
  );
}
