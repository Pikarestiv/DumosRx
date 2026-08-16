"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useStore } from "@/lib/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getSyncQueueCount } from "@/lib/db/queries/setup";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/lib/context/auth-context";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { SyncIndicator } from "./sync-indicator";
import { cn } from "@/lib/utils";
import {
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  MessageSquare,
  ClipboardPlus,
  PackagePlus,
  Repeat,
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const { data: pendingCountData } = useQuery({
    ...queryKeys.sync.queueCount(),
    queryFn: () => getSyncQueueCount(),
  });
  const pendingCount = pendingCountData || 0;

  // Matches user-nav.tsx's desktop "Log out completely" — also clears the
  // recent-users tile cache, not just the session, so /login lands on the
  // full username+PIN form rather than the tile picker. Without clearing
  // that cache, this looked identical to Switch Account (which intentionally
  // keeps it, since nothing is actually being logged out there).
  const performFullLogout = () => {
    localStorage.removeItem("dumos_recent_users");
    logout();
    router.push("/login");
  };

  const handleLogoutAttempt = () => {
    if (pendingCount > 0) {
      setShowLogoutConfirm(true);
    } else {
      onOpenChange(false);
      performFullLogout();
    }
  };

  // Not destructive — the local session/data stays intact, this just shows
  // the same lock screen used for idle re-auth, forced to account-selection
  // mode instead of defaulting to the current user's PIN entry. No
  // logout/unsynced-changes warning needed since nothing is being cleared.
  const handleSwitchAccount = () => {
    onOpenChange(false);
    useAutoLockStore.getState().lockForSwitch();
  };

  const allModules = [
    ...(storeType === "pharmacy"
      ? [{ name: "Prescriptions", href: "/prescriptions", icon: ClipboardPlus }]
      : []),
    ...(isAdmin || canManageStockBatch
      ? [
          { name: "Procurement", href: "/procurement", icon: PackagePlus },
          { name: "Expenses", href: "/expenses", icon: Wallet },
          { name: "Reports", href: "/reports", icon: BarChart3 },
          { name: "Settings", href: "/settings", icon: Settings },
        ]
      : []),
  ];

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className="h-[90vh] flex flex-col p-0 pb-6 rounded-t-xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DrawerHeader className="px-6 pt-2 pb-2 text-left">
            <DrawerTitle className="font-serif font-black text-2xl">
              More
            </DrawerTitle>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto pl-4 pr-2 mr-2">
            <div className="space-y-1">
              {allModules.map((item) => {
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
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="h-5 w-5 opacity-90" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>

            <div className="my-4 border-t border-border pt-4 space-y-1">
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
                onClick={handleSwitchAccount}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Repeat className="h-5 w-5 opacity-90" />
                <span>Switch Account</span>
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
          <div className="px-6 pt-3 mt-auto">
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
          performFullLogout();
        }}
      />
    </>
  );
}
