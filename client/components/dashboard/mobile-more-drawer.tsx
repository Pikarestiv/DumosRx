"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { useAccountActions } from "@/lib/hooks/use-account-actions";
import { UnsyncedLogoutDialog } from "./unsynced-logout-dialog";
import { SyncIndicator } from "./sync-indicator";
import { cn } from "@/lib/utils";
import {
  Wallet,
  BarChart3,
  Settings,
  ClipboardPlus,
  PackagePlus,
  History,
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
  const { storeType } = useStore();
  const { isAdmin, canManageStockBatch } = useAuth();

  const {
    navActions,
    pendingCount,
    showLogoutConfirm,
    setShowLogoutConfirm,
    confirmFullLogout,
  } = useAccountActions({
    onClose: () => onOpenChange(false),
    onOpenFeedback,
  });

  const allModules = [
    ...(storeType === "pharmacy"
      ? [{ name: "Prescriptions", href: "/prescriptions", icon: ClipboardPlus }]
      : []),
    ...(isAdmin || canManageStockBatch
      ? [
          { name: "Procurement", href: "/procurement", icon: PackagePlus },
          { name: "Expenses", href: "/expenses", icon: Wallet },
          { name: "Reports", href: "/reports", icon: BarChart3 },
          { name: "Activity Log", href: "/activity-log", icon: History },
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
              {navActions.map((action) => (
                <button
                  key={action.key}
                  onClick={action.onClick}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-4 rounded-xl font-medium transition-colors",
                    action.destructive
                      ? "text-destructive hover:bg-destructive hover:text-white"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <action.icon className="h-5 w-5 opacity-90" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sync Indicator at the bottom */}
          <div className="px-6 pt-3 mt-auto">
            <SyncIndicator collapsed={false} />
          </div>
        </DrawerContent>
      </Drawer>
      <UnsyncedLogoutDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        pendingCount={pendingCount}
        onConfirm={confirmFullLogout}
      />
    </>
  );
}
