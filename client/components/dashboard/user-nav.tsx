"use client";

import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Repeat } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThemeCustomizer } from "@/components/ui/theme-customizer";
import { getUserInitials } from "@/lib/utils";

export function UserNav() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [pendingLogoutType, setPendingLogoutType] = useState<"switch" | "full" | null>(null);

  const { data: queueData } = useLocalData<{ count: number }>(
    "SELECT COUNT(*) as count FROM _sync_queue"
  );
  const pendingCount = queueData?.[0]?.count || 0;

  if (!user) return null;

  const initials = getUserInitials(user.first_name, user.last_name);

  const performLogout = (type: "switch" | "full") => {
    if (type === "full") {
      localStorage.removeItem("dumos_recent_users"); // Clear lock screen history
    }
    logout();
    router.push("/login");
  };

  const handleLogoutAttempt = (type: "switch" | "full") => {
    if (pendingCount > 0) {
      setPendingLogoutType(type);
      setShowLogoutConfirm(true);
    } else {
      performLogout(type);
    }
  };

  const handleSwitchAccount = () => handleLogoutAttempt("switch");
  const handleFullLogout = () => handleLogoutAttempt("full");

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8 border border-border">
            <AvatarFallback className="bg-primary/10 text-primary hover:text-accent-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1 overflow-hidden">
            <p className="text-sm font-medium leading-none truncate">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs leading-none text-muted-foreground capitalize truncate">
              {user.role.replace(/_/g, " ")}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="sm:hidden px-2 py-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground px-2">Appearance</span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <ThemeCustomizer />
          </div>
        </div>
        <DropdownMenuSeparator className="sm:hidden" />
        <DropdownMenuItem
          onClick={handleSwitchAccount}
          className="cursor-pointer group"
        >
          <Repeat className="mr-2 h-4 w-4 group-hover:text-white group-focus:text-white transition-colors" />
          <span>Switch Account</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleFullLogout}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4 text-destructive" />
          <span>Log out completely</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <ConfirmDialog
      open={showLogoutConfirm}
      onOpenChange={setShowLogoutConfirm}
      title="Unsynced Changes Detected"
      description={`You have ${pendingCount} offline transaction${pendingCount > 1 ? "s" : ""} pending sync. If you log out now, another user logging into this device will sync them on their account. Are you sure you want to sign out?`}
      confirmLabel="Sign Out Anyway"
      variant="destructive"
      onConfirm={() => {
        if (pendingLogoutType) {
          performLogout(pendingLogoutType);
        }
      }}
    />
    </>
  );
}
