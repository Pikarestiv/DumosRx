"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Repeat, MessageSquare, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { getSyncQueueCount } from "@/lib/db/queries/setup";
import { queryKeys } from "@/lib/query-keys";

export interface NavAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
}

interface UseAccountActionsOptions {
  onClose: () => void;
  onOpenFeedback?: () => void;
}

// Shared by every surface that offers account-level actions (desktop
// dropdown + its own mobile avatar drawer in user-nav.tsx, and the bottom
// nav's "More" sheet in mobile-more-drawer.tsx). These used to be three
// hand-copied implementations, and they drifted: one surface's plain
// logout() left the recent-users tile cache intact, so it looked identical
// to Switch Account instead of actually ending the session. One
// implementation here means that specific drift can't happen again.
export function useAccountActions({
  onClose,
  onOpenFeedback,
}: UseAccountActionsOptions) {
  const { logout } = useAuth();
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const { data: pendingCountData } = useQuery({
    ...queryKeys.sync.queueCount(),
    queryFn: () => getSyncQueueCount(),
  });
  const pendingCount = pendingCountData || 0;

  const performFullLogout = () => {
    localStorage.removeItem("dumos_recent_users"); // Clear lock screen history
    logout();
    router.push("/login");
  };

  // Not destructive: the local session/data stays intact, this just shows
  // the same lock screen used for idle re-auth, forced to account-selection
  // mode instead of defaulting to the current user's PIN entry. No
  // logout/unsynced-changes warning needed since nothing is being cleared.
  const handleSwitchAccount = () => {
    onClose();
    useAutoLockStore.getState().lockForSwitch();
  };

  const handleFullLogout = () => {
    onClose();
    if (pendingCount > 0) {
      setShowLogoutConfirm(true);
    } else {
      performFullLogout();
    }
  };

  const navActions: NavAction[] = [
    ...(onOpenFeedback
      ? [
          {
            key: "feedback",
            label: "Help & Feedback",
            icon: MessageSquare,
            onClick: () => {
              onClose();
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

  return {
    navActions,
    pendingCount,
    showLogoutConfirm,
    setShowLogoutConfirm,
    confirmFullLogout: () => {
      onClose();
      performFullLogout();
    },
  };
}
