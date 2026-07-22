"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getSyncQueueCount } from "@/lib/db/queries/setup";
import { useAuth } from "@/lib/context/auth-context";
import { SyncIndicator } from "./sync-indicator";
import { cn } from "@/lib/utils";
import {
  FileText,
  ClipboardList,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  MessageSquare,
  Search,
} from "lucide-react";

interface MobileMoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFeedback: () => void;
}

export function MobileMoreDrawer({
  open,
  onOpenChange,
  onOpenFeedback,
}: MobileMoreDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { storeType } = useStore();
  const { logout, isAdmin, canManageStockBatch } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  const { data: pendingCountData } = useQuery({
    queryKey: ['syncQueueCount'],
    queryFn: () => getSyncQueueCount()
  });
  const pendingCount = pendingCountData || 0;

  const handleLogoutAttempt = () => {
    if (pendingCount > 0) {
      setShowLogoutConfirm(true);
    } else {
      onOpenChange(false);
      logout();
    }
  };

  const allModules = [
    ...(storeType === "pharmacy"
      ? [{ name: "Prescriptions", href: "/prescriptions", icon: FileText }]
      : []),
    ...(isAdmin || canManageStockBatch
      ? [
          { name: "Procurement", href: "/procurement", icon: ClipboardList },
          { name: "Expenses", href: "/expenses", icon: Wallet },
          { name: "Reports", href: "/reports", icon: BarChart3 },
          { name: "Settings", href: "/settings", icon: Settings },
        ]
      : []),
  ];

  const filteredModules = allModules.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[90vh] flex flex-col p-0 pb-6 rounded-t-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DrawerHeader className="px-6 pt-2 pb-2 text-left">
          <DrawerTitle className="font-serif font-black text-2xl">More</DrawerTitle>
        </DrawerHeader>
        
        <div className="px-6 pb-4">
          <form className="relative" onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) {
              router.push(`/inventory/products?search=${encodeURIComponent(searchQuery)}`);
              onOpenChange(false);
            }
          }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input 
              placeholder="Search features, products..." 
              className="pl-9 bg-muted/50 border-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="hidden" />
          </form>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="space-y-1">
            {filteredModules.length > 0 && (
                                        filteredModules.map((item) => {
                                          const isActive = pathname.startsWith(item.href);
                                          const Icon = item.icon;
                                          return (
                                            <Link
                                              key={item.name}
                                              href={item.href}
                                              onClick={() => onOpenChange(false)}
                                              className={cn(
                                                "flex items-center gap-4 px-4 py-4 rounded-xl font-medium transition-colors",
                                                isActive
                                                  ? "bg-primary text-primary-foreground shadow-sm"
                                                  : "text-foreground hover:bg-muted"
                                              )}
                                            >
                                              <Icon className="h-5 w-5 opacity-90" />
                                              <span>{item.name}</span>
                                            </Link>
                                          );
                                        })
                                      )}
                          {!(filteredModules.length > 0) && (
                                        <div className="py-8 text-center text-muted-foreground text-sm flex flex-col items-center">
                                          <span>No features found.</span>
                                          <span className="text-primary mt-1">Press Enter to search inventory for "{searchQuery}"</span>
                                        </div>
                                      )}
          </div>

          <div className="mt-8 mb-4 border-t border-border pt-4 space-y-1">
            <button
              onClick={() => {
                onOpenChange(false);
                onOpenFeedback();
              }}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-xl font-medium text-foreground hover:bg-muted transition-colors"
            >
              <MessageSquare className="h-5 w-5 opacity-90" />
              <span>Help & Feedback</span>
            </button>
            <button
              onClick={handleLogoutAttempt}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-xl font-medium text-destructive hover:bg-destructive hover:text-white transition-colors"
            >
              <LogOut className="h-5 w-5 opacity-90" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
        
        {/* Sync Indicator at the bottom */}
        <div className="px-6 mt-auto">
          <SyncIndicator collapsed={false} />
        </div>
      </DrawerContent>
    </Drawer>
    <ConfirmDialog
      open={showLogoutConfirm}
      onOpenChange={setShowLogoutConfirm}
      title="Unsynced Changes Detected"
      description={`You have ${pendingCount} offline transaction${pendingCount > 1 ? "s" : ""} pending sync. If you log out now, another user logging into this device will sync them on their account. Are you sure you want to sign out?`}
      confirmLabel="Sign Out Anyway"
      variant="destructive"
      onConfirm={() => {
        onOpenChange(false);
        logout();
      }}
    />
    </>
  );
}
