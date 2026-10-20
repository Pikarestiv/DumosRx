"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Repeat, MessageSquare, Sparkles, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { getSyncQueueCount } from "@/lib/db/queries/setup";
import { queryKeys } from "@/lib/query-keys";
import { clearRecentUsers } from "@/lib/storage-keys";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";
import { ASSISTANT_FEATURE_KEY, ASSISTANT_NAME } from "@/components/assistant/assistant-brand";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";

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

// Shared by every surface that offers account-level actions (desktop dropdown + its own mobile avatar drawer in user-nav.tsx, and the bottom n…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-account-actions-ts-L29
export function useAccountActions({
  onClose,
  onOpenFeedback,
}: UseAccountActionsOptions) {
  const { logout } = useAuth();
  const router = useRouter();
  const { canUseAiAssistant, withRestriction } = useFeatureGate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const { data: pendingCountData } = useQuery({
    ...queryKeys.sync.queueCount(),
    queryFn: () => getSyncQueueCount(),
  });
  const pendingCount = pendingCountData || 0;

  const performFullLogout = () => {
    clearRecentUsers();
    logout();
    router.push("/login");
  };

  // Not destructive: the local session/data stays intact, this just shows the same lock screen used for idle re-auth, forced to account-selectio…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-account-actions-ts-L57
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
    {
      key: "assistant",
      label: `Ask ${ASSISTANT_NAME} (Beta)`,
      icon: Sparkles,
      onClick: withRestriction(
        () => {
          onClose();
          useAssistantPanel.getState().open();
        },
        {
          enforceMobileAccess: false,
          featureAllowed: canUseAiAssistant,
          featureKey: ASSISTANT_FEATURE_KEY,
        },
      ),
    },
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
