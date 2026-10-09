import { describe, it, expect } from "vitest";
import {
  canAccessSettingsTab,
  ALL_SETTINGS_TABS,
} from "@/lib/constants/settings-tabs";

/**
 * A-198: the diagnostics tab was absent from ALL_SETTINGS_TABS (so a
 * client-side navigation rendered Appearance instead) and gated by nothing.
 *
 * Two support sessions can see it and they differ: an on-till inspection is
 * read-only and must be denied every other tab, while the impersonation
 * handoff — the only path that ever reached this console — keeps the access
 * it always had.
 */
const noKeys = () => false;
const allKeys = () => true;

const INSPECTING = { inspecting: true };
const IMPERSONATING = { impersonating: true };
const NEITHER = {};

describe("the diagnostics settings tab", () => {
  it("is resolvable from a URL at all", () => {
    expect(ALL_SETTINGS_TABS as readonly string[]).toContain("diagnostics");
  });

  it("is open to an impersonating superadmin", () => {
    // Gating this on inspection alone sent them to Appearance — a regression
    // of the one path that worked before this feature existed.
    expect(canAccessSettingsTab("diagnostics", true, allKeys, IMPERSONATING)).toBe(true);
  });

  it("is open to an inspecting admin even when the signed-in user is a cashier", () => {
    expect(canAccessSettingsTab("diagnostics", false, noKeys, INSPECTING)).toBe(true);
  });

  it("is closed without a support session, including to a real admin", () => {
    expect(canAccessSettingsTab("diagnostics", true, allKeys, NEITHER)).toBe(false);
    expect(canAccessSettingsTab("diagnostics", false, noKeys, NEITHER)).toBe(false);
  });

  it("does not depend on the signed-in user's role", () => {
    // The inspecting admin is not the signed-in user; resolving this tab
    // against `isAdmin` is what made the first version wrong.
    expect(canAccessSettingsTab("diagnostics", false, noKeys, INSPECTING)).toBe(
      canAccessSettingsTab("diagnostics", true, allKeys, INSPECTING),
    );
  });

  it("opens no other tab to an inspecting admin, even on an owner's device", () => {
    // isAdmin=true and allKeys: the locked staff user is the OWNER.
    for (const tab of ALL_SETTINGS_TABS) {
      if (tab === "diagnostics") continue;
      expect(
        canAccessSettingsTab(tab, true, allKeys, INSPECTING),
        `${tab} must stay closed to a read-only inspection session`,
      ).toBe(false);
    }
  });

  it("keeps danger-zone and data closed against an owner-level signed-in user", () => {
    expect(canAccessSettingsTab("danger-zone", true, allKeys, INSPECTING)).toBe(false);
    expect(canAccessSettingsTab("data", true, allKeys, INSPECTING)).toBe(false);
  });

  it("does NOT strip impersonation's other tabs, which it has always had", () => {
    // Impersonation is read-only at the sync engine, not at the tab rail;
    // denying its tabs here would be a second regression.
    expect(canAccessSettingsTab("danger-zone", true, allKeys, IMPERSONATING)).toBe(true);
    expect(canAccessSettingsTab("data", true, allKeys, IMPERSONATING)).toBe(true);
  });

  it("leaves the ordinary rules untouched with no support session", () => {
    expect(canAccessSettingsTab("danger-zone", true, allKeys, NEITHER)).toBe(true);
    expect(canAccessSettingsTab("appearance", false, noKeys, NEITHER)).toBe(true);
    expect(canAccessSettingsTab("danger-zone", false, noKeys, NEITHER)).toBe(false);
  });
});
