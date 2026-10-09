import { useCallback, useEffect } from "react";
import {
  ALL_SETTINGS_TABS,
  canAccessSettingsTab,
} from "@/lib/constants/settings-tabs";
import { isTillInspectionSession } from "@/lib/utils/till-inspection";

/**
 * Resolves `/settings/<tab>` to an internal tab, honouring the legacy aliases
 * and the one permission rule the tab rail, the mobile list and the URL all
 * share — so a hidden trigger and a typed URL can never disagree.
 *
 * Extracted from use-settings.ts, which was at the 350-line limit.
 */
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
      canAccessSettingsTab(tab, isAdmin, hasKey, isTillInspectionSession()),
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
    // openCloudLink is a useState setter (referentially stable); depending on
    // the whole sync-state object reran this on every render and reopened the
    // Link DumosRx Cloud dialog right after the user closed it. See
    // __tests__/settings-cloud-link-dialog-loop.test.ts.
  }, [tabParam, isCloudLinked, canAccessTab, activeTab, setActiveTab, openCloudLink]);

  return { canAccessTab };
}
