import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  SETTINGS_TAB_PERMISSIONS,
  canAccessSettingsTab,
  settingsTabPermissionKeysAreInCatalog,
} from "@/lib/constants/settings-tabs";
import { ENFORCED_PERMISSION_KEYS } from "@/lib/constants/permissions";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

/**
 * The Settings tabs were all behind one coarse isAdmin check. This pass
 * converts the Store & Settings ones to the keys the catalog already names,
 * in ONE map that the desktop rail, the mobile list and use-settings' URL
 * resolution all read - so hiding a trigger and blocking /settings/<tab>
 * can never drift apart.
 */
describe("settings tab permission map", () => {
  it("maps each Store & Settings tab to its own key", () => {
    expect(SETTINGS_TAB_PERMISSIONS["business-info"]).toBe("manage_store_settings");
    expect(SETTINGS_TAB_PERMISSIONS["branches"]).toBe("manage_store_settings");
    expect(SETTINGS_TAB_PERMISSIONS["receipt-settings"]).toBe("manage_store_settings");
    expect(SETTINGS_TAB_PERMISSIONS["register-configs"]).toBe("manage_store_settings");
    expect(SETTINGS_TAB_PERMISSIONS["payment-methods"]).toBe("manage_payment_accounts");
    expect(SETTINGS_TAB_PERMISSIONS["data"]).toBe("backup_restore_data");
    expect(SETTINGS_TAB_PERMISSIONS["billing"]).toBe("manage_billing");
    expect(SETTINGS_TAB_PERMISSIONS["system"]).toBe("manage_device_settings");
  });

  it("leaves the tabs owned by other categories on the isAdmin fallback", () => {
    for (const tab of ["personal-info", "product-units", "categories", "staff", "roles", "danger-zone"]) {
      expect(SETTINGS_TAB_PERMISSIONS[tab]).toBeUndefined();
    }
  });

  it("only names keys that exist in the catalog", () => {
    expect(settingsTabPermissionKeysAreInCatalog()).toBe(true);
  });

  it("records every mapped key as enforced", () => {
    for (const key of Object.values(SETTINGS_TAB_PERMISSIONS)) {
      expect(ENFORCED_PERMISSION_KEYS.has(key)).toBe(true);
    }
  });

  it("resolves a mapped tab by its key alone, ignoring isAdmin", () => {
    expect(canAccessSettingsTab("billing", true, () => false)).toBe(false);
    expect(canAccessSettingsTab("billing", false, (k) => k === "manage_billing")).toBe(true);
  });

  it("keeps the isAdmin fallback for unmapped tabs", () => {
    expect(canAccessSettingsTab("danger-zone", true, () => false)).toBe(true);
    expect(canAccessSettingsTab("danger-zone", false, () => true)).toBe(false);
    expect(canAccessSettingsTab("appearance", false, () => false)).toBe(true);
  });
});

async function renderNav(
  Component: React.ComponentType<{ isAdmin: boolean; canAccessTab?: (tab: string) => boolean }>,
  canAccessTab: (tab: string) => boolean,
): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component, { isAdmin: true, canAccessTab }));
  });
  return container;
}

const NAV_LABELS: Record<string, string> = {
  "business-info": "Business Info",
  branches: "Branches",
  "payment-methods": "Payment Methods",
  "receipt-settings": "Receipt Settings",
  "register-configs": "Register Configs",
  data: "Data & Sync",
  billing: "Billing",
  system: "System",
};

describe("settings navigation honours the per-tab keys", () => {
  it("hides every tab whose key is withheld from an otherwise-admin session (mobile list)", async () => {
    const { SettingsMobileMenu } = await import("@/components/settings/settings-mobile-menu");
    const container = await renderNav(SettingsMobileMenu, () => false);
    for (const [tab, label] of Object.entries(NAV_LABELS)) {
      expect(container.querySelector(`a[href="/settings/${tab}"]`), label).toBeNull();
    }
  });

  it("still shows them when the keys are held (mobile list)", async () => {
    const { SettingsMobileMenu } = await import("@/components/settings/settings-mobile-menu");
    const container = await renderNav(SettingsMobileMenu, () => true);
    for (const [tab, label] of Object.entries(NAV_LABELS)) {
      expect(container.querySelector(`a[href="/settings/${tab}"]`), label).not.toBeNull();
    }
  });

  it("drops only the Billing entry when only manage_billing is withheld", async () => {
    const { SettingsMobileMenu } = await import("@/components/settings/settings-mobile-menu");
    const container = await renderNav(SettingsMobileMenu, (tab) => tab !== "billing");
    expect(container.querySelector('a[href="/settings/billing"]')).toBeNull();
    expect(container.querySelector('a[href="/settings/data"]')).not.toBeNull();
    expect(container.querySelector('a[href="/settings/business-info"]')).not.toBeNull();
  });
});
