import { useCallback, useEffect } from "react";
import {
  ALL_SETTINGS_TABS,
  canAccessSettingsTab,
} from "@/lib/constants/settings-tabs";
import { isTillInspectionSession } from "@/lib/utils/till-inspection";
import { isImpersonatedSession } from "@/lib/utils/impersonation";

// Resolves `/settings/<tab>` to an internal tab, honouring the legacy aliases and the one permission rule the tab rail, th…
// Rationale: docs/CLIENT_COMMENTS.md#block-hooks-use-settings-tab-resolution-ts-L9
const TAB_ALIASES: Record<string, string> = {
  account: "personal-info",
  store: "business-info",
  general: "appearance",
  alerts: "notifications",
};

interface Params {
  tabParam: string | undefined;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isAdmin: boolean;
  hasKey: (key: string) => boolean;
  isCloudLinked: boolean;
  openCloudLink: (open: boolean) => void;
}

export function useSettingsTabResolution({
  tabParam,
  activeTab,
  setActiveTab,
  isAdmin,
  hasKey,
  isCloudLinked,
  openCloudLink,
}: Params) {
  const canAccessTab = useCallback(
    (tab: string) =>
      canAccessSettingsTab(tab, isAdmin, hasKey, {
        inspecting: isTillInspectionSession(),
        impersonating: isImpersonatedSession(),
      }),
    [isAdmin, hasKey],
  );

  useEffect(() => {
    if (!tabParam) return;

    let internalTab = TAB_ALIASES[tabParam] ?? tabParam;

    if (internalTab === "cloud") {
      internalTab = "data";
      if (!isCloudLinked) openCloudLink(true);
    }

    if (!(ALL_SETTINGS_TABS as readonly string[]).includes(internalTab)) return;

    if (!canAccessTab(internalTab)) {
      setActiveTab("appearance");
      return;
    }

    if (activeTab !== internalTab) setActiveTab(internalTab);
    // openCloudLink is a useState setter (referentially stable); depending on the whole sync-state object reran this on every…
    // Rationale: docs/CLIENT_COMMENTS.md#line-hooks-use-settings-tab-resolution-ts-L69
  }, [tabParam, isCloudLinked, canAccessTab, activeTab, setActiveTab, openCloudLink]);

  return { canAccessTab };
}
