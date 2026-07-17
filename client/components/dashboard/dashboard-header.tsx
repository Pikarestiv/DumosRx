"use client";

import { useRouter } from "next/navigation";
import { Search, Plus, Store as StoreIcon } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { APP_NAME } from "@/lib/constants";
import { SyncIndicator } from "./sync-indicator";
import { NotificationBell } from "./notification-bell";
import { UserNav } from "./user-nav";
import { useState } from "react";

export function DashboardHeader() {
  const router = useRouter();
  const { user } = useAuth();
  const { storeProfile } = useStore();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/inventory/products?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <header
      className="h-auto min-h-16 py-3 bg-background flex items-center justify-between px-4 sm:px-6 sticky z-40 before:absolute before:inset-x-0 before:bottom-full before:h-[100vh] before:bg-background before:-z-10"
      style={{ top: "var(--tauri-top, 0px)" }}
    >
      {/* Left side (Desktop & Mobile) */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
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
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline-block">
            {new Date().toLocaleDateString("en-US", { weekday: 'long', month: 'short', day: 'numeric' })}
          </span>
          <span className="hidden sm:inline-block text-border">•</span>
          <div className="flex items-center gap-1 font-medium text-foreground">
            <StoreIcon className="h-3 w-3" />
            <span className="truncate max-w-[120px] sm:max-w-[200px]">
              {storeProfile?.name || APP_NAME}
            </span>
          </div>
        </div>

        {/* Mobile Sync Indicator */}
        <div className="sm:hidden mt-1">
          <SyncIndicator collapsed={false} isMobileHeader={true} />
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Desktop only features */}
        <div className="hidden sm:flex items-center gap-3">
          {/* Search Bar Placeholder */}
          {/* 
          <form onSubmit={handleSearch} className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products, customers..."
              className="pl-9 pr-4 py-2 bg-muted/50 border border-border/50 hover:border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-full text-sm outline-none transition-all w-64"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <button type="submit" className="text-[10px] font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 bg-background hover:bg-muted cursor-pointer pointer-events-auto">↵</button>
            </div>
          </form> 
          */}

          <button
            onClick={() => router.push("/pos")}
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Sale
          </button>
        </div>

        {/* Notification Bell */}
        <div className="relative border border-border/50 rounded-full p-0.5">
          <NotificationBell />
        </div>
        
        {/* Mobile User Nav */}
        <div className="sm:hidden">
          <UserNav />
        </div>
      </div>
    </header>
  );
}
