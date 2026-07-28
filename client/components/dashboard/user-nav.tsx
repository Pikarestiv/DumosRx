"use client";

import { Fragment, useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
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
import {
  LogOut,
  Repeat,
  Settings2,
  Settings,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThemeCustomizer } from "@/components/ui/theme-customizer";
import { getUserInitials } from "@/lib/utils";
import { useIsTouchDevice } from "@/lib/hooks/use-is-touch-device";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { cn } from "@/lib/utils";

interface NavAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
}

const NavTrigger = ({
  initials,
  user,
  showDetails,
}: {
  initials: string;
  user?: any;
  showDetails?: boolean;
}) => (
  <Button
    variant="ghost"
    className={cn(
      "relative rounded-xl hover:bg-muted/50 transition-colors text-foreground hover:text-foreground",
      showDetails
        ? "h-auto w-full flex items-center justify-start gap-3 p-2"
        : "h-8 w-8 rounded-full p-0",
    )}
  >
    <Avatar
      className={cn(
        "border border-border shrink-0",
        showDetails ? "h-9 w-9" : "h-8 w-8",
      )}
    >
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
    {showDetails && user && (
      <div className="flex flex-col items-start overflow-hidden">
        <span className="text-sm font-semibold truncate w-full text-left">
          {user.first_name} {user.last_name}
        </span>
        <span className="text-xs text-muted-foreground capitalize truncate w-full text-left">
          {user.role.replace(/_/g, " ")}
        </span>
      </div>
    )}
  </Button>
);

const MobileAppearanceSettings = () => (
  <div className="flex items-center justify-between px-3.5 py-2 bg-muted/30 border-b border-border">
    <div className="flex items-center gap-3">
      <Settings2 className="h-[18px] w-[18px] text-muted-foreground" />
      <span className="font-medium text-sm">Appearance</span>
    </div>
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <ThemeCustomizer />
    </div>
  </div>
);

/** Direct link to /settings, shown at the far right of the avatar/name/role row. */
const SettingsIconButton = ({
  onClick,
  size = "icon",
}: {
  onClick: () => void;
  size?: "default" | "sm" | "lg" | "icon" | null | undefined;
}) => (
  <Button
    variant="ghost"
    size={size}
    className="shrink-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
    onClick={onClick}
  >
    <Settings className="h-4 w-4" />
  </Button>
);

interface UserNavProps {
  showDetails?: boolean;
  onOpenFeedback?: () => void;
  onOpenChange?: (open: boolean) => void;
}

export function UserNav({
  showDetails,
  onOpenFeedback,
  onOpenChange,
}: UserNavProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  // Touch capability decides Drawer vs Dropdown, not viewport width — see the
  // comment in notification-bell.tsx for why (Radix DropdownMenu's outside-tap
  // close vs iOS's delayed synthetic click).
  const isTouchDevice = useIsTouchDevice();

  const [open, setOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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

  const performFullLogout = () => {
    localStorage.removeItem("dumos_recent_users"); // Clear lock screen history
    logout();
    router.push("/login");
  };

  // Not destructive — the local session/data stays intact, this just shows
  // the same lock screen used for idle re-auth, forced to account-selection
  // mode instead of defaulting to the current user's PIN entry. No
  // logout/unsynced-changes warning needed since nothing is being cleared.
  const handleSwitchAccount = () => {
    setOpen(false);
    useAutoLockStore.getState().lockForSwitch();
  };

  const handleFullLogout = () => {
    setOpen(false);
    if (pendingCount > 0) {
      setShowLogoutConfirm(true);
    } else {
      performFullLogout();
    }
  };

  const goToSettings = () => {
    setOpen(false);
    router.push("/settings");
  };

  // Shared between the desktop dropdown and the mobile drawer so the two
  // don't drift out of sync — only the surrounding markup differs per surface.
  const navActions: NavAction[] = [
    ...(onOpenFeedback
      ? [
          {
            key: "feedback",
            label: "Help & Feedback",
            icon: MessageSquare,
            onClick: () => {
              setOpen(false);
              onOpenFeedback();
            },
          },
        ]
      : []),
    {
      key: "switch",
      label: "Switch Account",
      icon: Repeat,
      onClick: handleSwitchAccount,
    },
    {
      key: "logout",
      label: "Log out completely",
      icon: LogOut,
      onClick: handleFullLogout,
      destructive: true,
    },
  ];

  const renderDesktopMenu = () => (
    <div className={cn("flex items-center gap-1", showDetails ? "w-full" : "")}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <div className={cn(showDetails ? "flex-1 min-w-0" : "")}>
            <NavTrigger
              initials={initials}
              user={user}
              showDetails={showDetails}
            />
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="w-56"
          align="end"
          side={showDetails ? "right" : "bottom"}
          forceMount
        >
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

          {navActions.map((action, idx) => (
            <Fragment key={action.key}>
              <DropdownMenuItem
                onClick={action.onClick}
                className={cn(
                  "cursor-pointer",
                  action.destructive
                    ? "text-destructive focus:text-destructive"
                    : "group",
                )}
              >
                <action.icon
                  className={cn(
                    "mr-2 h-4 w-4",
                    action.destructive
                      ? "text-destructive"
                      : "group-hover:text-white group-focus:text-white transition-colors",
                  )}
                />
                <span>{action.label}</span>
              </DropdownMenuItem>
              {idx < navActions.length - 1 && <DropdownMenuSeparator />}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Direct settings shortcut disabled on desktop for now — re-enable by
          uncommenting once we're happy with where it lands next to the trigger.
      {!!showDetails && <SettingsIconButton onClick={() => router.push("/settings")} />}
      */}
    </div>
  );

  const renderMobileDrawer = () => (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <div>
          <NavTrigger initials={initials} />
        </div>
      </DrawerTrigger>

      <DrawerContent
        className="p-0 pb-5 rounded-t-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DrawerHeader className="flex flex-row items-center gap-3 mx-5 pt-0 text-left border-b border-border space-y-0">
          <Avatar className="h-10 w-10 border border-border shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <DrawerTitle className="text-[15px] font-semibold truncate">
              {user.first_name} {user.last_name}
            </DrawerTitle>
            <p className="text-xs text-muted-foreground capitalize truncate">
              {user.role.replace(/_/g, " ")}
            </p>
          </div>
          <SettingsIconButton size="lg" onClick={goToSettings} />
        </DrawerHeader>

        {/* Bottom padding clears the fixed mobile bottom navbar (h-16) plus
            the safe-area/Tauri inset it already pads itself with, so the
            last action isn't sitting behind/under it. */}
        <div
          className="px-4 space-y-0.5"
          style={{
            paddingBottom:
              "calc(4rem + var(--tauri-bottom, env(safe-area-inset-bottom, 0px)))",
          }}
        >
          <MobileAppearanceSettings />

          {navActions.map((action, idx) => (
            <>
              <button
                key={action.key}
                onClick={action.onClick}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-sm font-medium transition-colors",
                  action.destructive
                    ? "text-destructive hover:bg-destructive/10"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <action.icon className="h-[18px] w-[18px] opacity-90" />
                <span>{action.label}</span>
              </button>

              {idx < navActions.length - 1 && <DropdownMenuSeparator />}
            </>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );

  return (
    <>
      {!isTouchDevice ? renderDesktopMenu() : renderMobileDrawer()}

      <ConfirmDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        title="Unsynced Changes Detected"
        description={`You have ${pendingCount} offline transaction${pendingCount > 1 ? "s" : ""} pending sync. If you log out now, another user logging into this device will sync them on their account. Are you sure you want to sign out?`}
        confirmLabel="Sign Out Anyway"
        variant="destructive"
        onConfirm={performFullLogout}
      />
    </>
  );
}
