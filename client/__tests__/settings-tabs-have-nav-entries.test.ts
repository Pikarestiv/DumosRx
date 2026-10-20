import { describe, it, expect } from "vitest";

import { ALL_SETTINGS_TABS } from "@/lib/constants/settings-tabs";
import { SETTINGS_NAV_TAB_VALUES } from "@/app/(dashboard)/settings/[tab]/settings-tab-nav";
import { SETTINGS_MOBILE_MENU_TAB_VALUES } from "@/components/settings/settings-mobile-menu";

// A tab with a <TabsContent> but no trigger in either list is unreachable by clicking, in every session that is allowed to…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-settings-tabs-have-nav-entries-test-ts-L7
describe("every settings tab is reachable from the nav", () => {
  it("has a desktop rail entry for each tab", () => {
    expect([...SETTINGS_NAV_TAB_VALUES].sort()).toEqual([...ALL_SETTINGS_TABS].sort());
  });

  it("has a mobile menu entry for each tab", () => {
    expect([...SETTINGS_MOBILE_MENU_TAB_VALUES].sort()).toEqual([...ALL_SETTINGS_TABS].sort());
  });
});
