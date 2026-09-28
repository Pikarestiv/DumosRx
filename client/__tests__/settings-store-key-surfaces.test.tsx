import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Two surfaces inside tabs whose own gate is a DIFFERENT key, which is why
 * they can't just ride the tab-level check in settings-tabs.ts:
 *
 * - Regional Settings (currency, VAT, reseller commission) is store-wide
 *   config sitting on the General tab, which every role can open. It was
 *   isAdmin-gated; it is now manage_store_settings, the same population.
 * - The System tab's "Manage Billing" card is only a shortcut into the
 *   Billing tab, so it takes manage_billing rather than the System tab's own
 *   manage_device_settings — otherwise a specialist (who holds the device
 *   key but not the billing one) gets a link into a screen that bounces them.
 */

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/db/core", () => ({ isTauri: () => false }));
vi.mock("@/components/settings/ios-install-card", () => ({
  IosInstallCard: () => null,
}));
vi.mock("@/components/settings/android-install-card", () => ({
  AndroidInstallCard: () => null,
}));
vi.mock("@/components/settings/download-apps-card", () => ({
  DownloadAppsCard: () => null,
}));
vi.mock("@/components/settings/theme-appearance-card", () => ({
  ThemeAppearanceCard: () => <div>theme-card</div>,
}));
vi.mock("@/components/settings/sidebar-preferences-card", () => ({
  SidebarPreferencesCard: () => <div>sidebar-card</div>,
}));
vi.mock("@/components/settings/regional-settings-card", () => ({
  RegionalSettingsCard: () => <div>regional-card</div>,
}));

import { SystemSettings } from "@/components/settings/system-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";

function deny(...denied: string[]) {
  hasPermission.mockImplementation((key: string) => !denied.includes(key));
}

const appearanceProps = {
  theme: "light",
  setTheme: vi.fn(),
  activeTheme: "default",
  setAppTheme: vi.fn(),
  localCurrency: "NGN",
  setLocalCurrency: vi.fn(),
  localVat: "0",
  setLocalVat: vi.fn(),
  localResellerCommission: "0",
  setLocalResellerCommission: vi.fn(),
  handleSaveRegional: vi.fn(),
};

describe("Store & Settings keys on in-tab surfaces", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks manage_billing for the System tab's billing shortcut", () => {
    render(<SystemSettings />);
    expect(hasPermission).toHaveBeenCalledWith("manage_billing");
    expect(screen.queryByText("Manage Billing")).not.toBeNull();
  });

  it("drops the billing shortcut without manage_billing, keeping the rest of System", () => {
    deny("manage_billing");
    render(<SystemSettings />);
    expect(screen.queryByText("Manage Billing")).toBeNull();
    expect(screen.queryByText("System Updates")).not.toBeNull();
  });

  it("checks manage_store_settings for the Regional Settings card", () => {
    render(<AppearanceSettings {...appearanceProps} />);
    expect(hasPermission).toHaveBeenCalledWith("manage_store_settings");
    expect(screen.queryByText("regional-card")).not.toBeNull();
  });

  it("drops Regional Settings without the key, keeping theme and sidebar cards", () => {
    deny("manage_store_settings");
    render(<AppearanceSettings {...appearanceProps} />);
    expect(screen.queryByText("regional-card")).toBeNull();
    expect(screen.queryByText("theme-card")).not.toBeNull();
    expect(screen.queryByText("sidebar-card")).not.toBeNull();
  });
});
