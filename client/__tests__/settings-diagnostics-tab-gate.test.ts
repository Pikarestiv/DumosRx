import { describe, it, expect } from "vitest";
import {
  canAccessSettingsTab,
  ALL_SETTINGS_TABS,
  ADMIN_ONLY_SETTINGS_TABS,
} from "@/lib/constants/settings-tabs";

/**
 * A-198: the diagnostics tab was absent from ALL_SETTINGS_TABS (so a
 * client-side navigation rendered Appearance instead) and gated by nothing.
 *
 * Opening it to an inspecting admin must NOT open anything else: `data` and
 * `danger-zone` reach restoreDatabase()/resetDatabase() through core.ts raw,
 * outside the read-only write guard.
 */
const noKeys = () => false;
const allKeys = () => true;

describe("the diagnostics settings tab", () => {
  it("is resolvable from a URL at all", () => {
    expect(ALL_SETTINGS_TABS as readonly string[]).toContain("diagnostics");
  });

  it("is open to an inspecting admin even when the signed-in user is a cashier", () => {
    expect(canAccessSettingsTab("diagnostics", false, noKeys, true)).toBe(true);
  });

  it("is closed to everyone without an inspection session, including an admin", () => {
    expect(canAccessSettingsTab("diagnostics", true, allKeys, false)).toBe(false);
    expect(canAccessSettingsTab("diagnostics", false, noKeys, false)).toBe(false);
  });

  it("does not depend on the signed-in user's role at all", () => {
    // The inspecting admin is not the signed-in user; resolving this tab
    // against `isAdmin` is what made the first fix wrong.
    expect(canAccessSettingsTab("diagnostics", false, noKeys, true)).toBe(
      canAccessSettingsTab("diagnostics", true, allKeys, true),
    );
  });

  it("opens no other admin-only tab for an inspecting admin", () => {
    for (const tab of ADMIN_ONLY_SETTINGS_TABS) {
      expect(
        canAccessSettingsTab(tab, false, noKeys, true),
        `${tab} must stay closed to a read-only inspection session`,
      ).toBe(false);
    }
  });

  it("keeps danger-zone and data closed specifically, since they write outside the guard", () => {
    expect(canAccessSettingsTab("danger-zone", false, noKeys, true)).toBe(false);
    expect(canAccessSettingsTab("data", false, noKeys, true)).toBe(false);
  });
});
