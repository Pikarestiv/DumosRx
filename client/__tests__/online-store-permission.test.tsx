import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * manage_online_store is the storefront slice of the Store & Settings
 * category, and it deliberately cuts ACROSS two tabs rather than owning one:
 * the Store Profile block (public URL slug + the Enable Online Store switch)
 * lives inside Business Info, which is manage_store_settings, and the
 * Paystack payout onboarding lives inside Payment Methods, which is
 * manage_payment_accounts. Both only exist to make the public storefront
 * work, so they carry the storefront key on top of their tab's own.
 *
 * products.show_online stays under manage_products - see AGENTS.md.
 */

const hasPermission = vi.fn((_key: string) => true);

// jsdom has no matchMedia; components/ui/tooltip.tsx reads it on mount.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
});

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("@/lib/constants", () => ({
  STOREFRONT_BASE_URL: "https://shop.example",
}));
vi.mock("@/components/settings/store/payment-settings-card", () => ({
  PaymentSettingsCard: () => <div>payment-settings-card</div>,
}));
vi.mock("@/components/settings/store/payment-accounts-card", () => ({
  PaymentAccountsCard: () => <div>payment-accounts-card</div>,
}));
vi.mock("@/components/settings/store/online-payments-section", () => ({
  OnlinePaymentsSection: () => <div>online-payments-section</div>,
}));

import { StoreProfileSection } from "@/components/settings/store/store-profile-section";
import { PaymentMethodsPanel } from "@/app/(dashboard)/settings/[tab]/panels/payment-methods-panel";
import type { SettingsState } from "@/hooks/use-settings";

function deny(...denied: string[]) {
  hasPermission.mockImplementation((key: string) => !denied.includes(key));
}

const sectionProps = {
  storeType: "retail" as const,
  isEditingProfile: true,
  localStoreSlug: "my-store",
  setLocalStoreSlug: vi.fn(),
  storeSlugChangedAt: null,
  localPcn: "",
  setLocalPcn: vi.fn(),
  onlineStoreEnabled: true,
  setOnlineStoreEnabled: vi.fn(),
  canUseEcommerce: true,
  loyaltyProgramEnabled: false,
  setLoyaltyProgramEnabled: vi.fn(),
  canAccessLoyaltyProgramPlan: true,
  getUpgradeMessage: (_f: string, fallback?: string) => fallback ?? "",
};

const panelProps = {
  storeProfile: { id: "s1", name: "Store" },
} as unknown as SettingsState;

describe("manage_online_store", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks the key specifically in the Store Profile block", () => {
    render(<StoreProfileSection {...sectionProps} />);
    expect(hasPermission).toHaveBeenCalledWith("manage_online_store");
  });

  it("shows the storefront URL and the Enable Online Store switch with the key", () => {
    render(<StoreProfileSection {...sectionProps} />);
    expect(screen.queryByText("Store URL Slug")).not.toBeNull();
    expect(screen.queryByText("Enable Online Store")).not.toBeNull();
  });

  it("hides both storefront controls without the key, keeping the loyalty toggle", () => {
    deny("manage_online_store");
    render(<StoreProfileSection {...sectionProps} />);
    expect(screen.queryByText("Store URL Slug")).toBeNull();
    expect(screen.queryByText("Enable Online Store")).toBeNull();
    expect(screen.queryByText("Enable Loyalty Program")).not.toBeNull();
  });

  it("renders nothing at all rather than an empty bordered box", () => {
    deny("manage_online_store");
    const { container } = render(
      <StoreProfileSection
        {...sectionProps}
        setLoyaltyProgramEnabled={undefined}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("gates the Paystack payout section on the Payment Methods tab", () => {
    render(<PaymentMethodsPanel {...panelProps} />);
    expect(screen.queryByText("online-payments-section")).not.toBeNull();

    deny("manage_online_store");
    const { container } = render(<PaymentMethodsPanel {...panelProps} />);
    expect(container.textContent).not.toContain("online-payments-section");
    expect(container.textContent).toContain("payment-accounts-card");
  });
});
