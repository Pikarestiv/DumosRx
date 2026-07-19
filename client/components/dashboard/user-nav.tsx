"use client";

import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSyncQueueCount } from "@/lib/db/queries/setup";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Repeat, Settings2, MessageSquare } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThemeCustomizer } from "@/components/ui/theme-customizer";
import { getUserInitials } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const NavTrigger = ({ initials, user, showDetails }: { initials: string, user?: any, showDetails?: boolean }) => (
  <Button variant="ghost" className={cn("relative rounded-xl hover:bg-muted/50 transition-colors text-foreground hover:text-foreground", showDetails ? "h-auto w-full flex items-center justify-start gap-3 p-2" : "h-8 w-8 rounded-full p-0")}>
    <Avatar className={cn("border border-border shrink-0", showDetails ? "h-9 w-9" : "h-8 w-8")}>
      <AvatarFallback className="bg-primary/10 text-primary hover:text-accent-foreground text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
    {showDetails && user && (
      <div className="flex flex-col items-start overflow-hidden">
        <span className="text-sm font-semibold truncate w-full text-left">{user.first_name} {user.last_name}</span>
        <span className="text-xs text-muted-foreground capitalize truncate w-full text-left">{user.role.replace(/_/g, " ")}</span>
      </div>
    )}
  </Button>
);

const MobileAppearanceSettings = () => (
  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl mb-4 border border-border/40">
    <div className="flex items-center gap-3">
      <Settings2 className="h-5 w-5 text-muted-foreground" />
      <span className="font-medium text-sm">Appearance</span>
    </div>
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <ThemeCustomizer />
    </div>
  </div>
);

interface UserNavProps {
  showDetails?: boolean;
  onOpenFeedback?: () => void;
  onOpenChange?: (open: boolean) => void;
}

export function UserNav({ showDetails, onOpenFeedback, onOpenChange }: UserNavProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const [open, setOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [pendingLogoutType, setPendingLogoutType] = useState<
    "switch" | "full" | null
  >(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const { data: pendingCountData } = useQuery({
    queryKey: ["syncQueueCount"],
    queryFn: () => getSyncQueueCount(),
  });
  const pendingCount = pendingCountData || 0;

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

  const handleSwitchAccount = () => {
    setOpen(false);
    handleLogoutAttempt("switch");
  };

  const handleFullLogout = () => {
    setOpen(false);
    handleLogoutAttempt("full");
  };

  const renderDesktopMenu = () => (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <div className={cn(showDetails ? "w-full" : "")}>
          <NavTrigger initials={initials} user={user} showDetails={showDetails} />
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align={showDetails ? "end" : "end"} side={showDetails ? "right" : "bottom"} forceMount>
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
        
        <div className="px-2 py-1.5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Appearance</span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <ThemeCustomizer />
          </div>
        </div>

        <DropdownMenuSeparator />
        {onOpenFeedback && (
          <>
            <DropdownMenuItem
              onClick={() => {
                setOpen(false);
                onOpenFeedback();
              }}
              className="cursor-pointer group"
            >
              <MessageSquare className="mr-2 h-4 w-4 group-hover:text-white group-focus:text-white transition-colors" />
              <span>Help & Feedback</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
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
  );

  const renderMobileDrawer = () => (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <div>
          <NavTrigger initials={initials} />
        </div>
      </DrawerTrigger>

      <DrawerContent
        className="p-0 pb-6 rounded-t-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DrawerHeader className="px-6 pt-6 pb-2 text-left border-b border-border/40">
          <DrawerTitle className="font-serif font-black text-2xl truncate">
            {user.first_name} {user.last_name}
          </DrawerTitle>
          <p className="text-sm text-muted-foreground capitalize">
            {user.role.replace(/_/g, " ")}
          </p>
        </DrawerHeader>

        <div className="px-4 py-4 space-y-2">
          <MobileAppearanceSettings />

          {onOpenFeedback && (
            <button
              onClick={() => {
                setOpen(false);
                onOpenFeedback();
              }}
              className="w-full flex items-center gap-4 p-4 rounded-xl font-medium text-foreground hover:bg-muted transition-colors border border-transparent"
            >
              <MessageSquare className="h-5 w-5 opacity-90" />
              <span>Help & Feedback</span>
            </button>
          )}

          <button
            onClick={handleSwitchAccount}
            className="w-full flex items-center gap-4 p-4 rounded-xl font-medium text-foreground hover:bg-muted transition-colors border border-transparent"
          >
            <Repeat className="h-5 w-5 opacity-90" />
            <span>Switch Account</span>
          </button>

          <button
            onClick={handleFullLogout}
            className="w-full flex items-center gap-4 p-4 rounded-xl font-medium text-destructive hover:bg-destructive/10 transition-colors border border-transparent"
          >
            <LogOut className="h-5 w-5 opacity-90" />
            <span>Log out completely</span>
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );

  return (
    <>
      {isDesktop ? renderDesktopMenu() : renderMobileDrawer()}

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
