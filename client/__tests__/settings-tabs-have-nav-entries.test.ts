import { describe, it, expect } from "vitest";

import { ALL_SETTINGS_TABS } from "@/lib/constants/settings-tabs";
import { SETTINGS_NAV_TAB_VALUES } from "@/app/(dashboard)/settings/[tab]/settings-tab-nav";
import { SETTINGS_MOBILE_MENU_TAB_VALUES } from "@/components/settings/settings-mobile-menu";

/**
 * A tab with a <TabsContent> but no trigger in either list is unreachable by
 * clicking, in every session that is allowed to see it. That is how the
 * diagnostics console shipped invisible: the gate was right, the door was
 * never built, and `/settings/diagnostics` was the only way in (A-251).
 *
 * The two lists are deliberately separate (desktop rail vs mobile menu, with
 * different copy), so nothing stops one gaining an entry the other lacks.
 * This is the check that does.
 */
describe("every settings tab is reachable from the nav", () => {
  it("has a desktop rail entry for each tab", () => {
    expect([...SETTINGS_NAV_TAB_VALUES].sort()).toEqual([...ALL_SETTINGS_TABS].sort());
  });

  it("has a mobile menu entry for each tab", () => {
    expect([...SETTINGS_MOBILE_MENU_TAB_VALUES].sort()).toEqual([...ALL_SETTINGS_TABS].sort());
  });
});
